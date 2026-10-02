import "server-only";
import { ContractStateChanged, createRenewal, defaultRenewalPeriod, endCustomerContract } from "@/lib/contract-ops";
import { formatDate, fromDbDate, todayKst, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";

// 매일 배치 (데이터모델 4장) — 여러 번 실행해도 결과가 같음(이미 처리한 건은 조건에서 빠짐)
// ① 갱신 취소·연장 안 함 계약의 종료일 경과 → 계약종료 + 회수·종료 체크리스트
// ② 미조치 계약의 종료일 경과 → 설정 기간으로 자동연장 (자동연장 미승인 배지)
// (3단계에서 ③ 월 청구 건 생성 ④ 알림 생성·해제 추가)
export async function runDailyBatch(today = todayKst()) {
  const result = { ended: [] as string[], autoRenewed: [] as string[], errors: [] as string[] };

  const due = await prisma.contract.findMany({
    where: { state: "CURRENT", endDate: { lt: toDbDate(today) }, customer: { status: "ACTIVE" } },
    select: { id: true, customerId: true, endDate: true, renewalCancelled: true, autoRenew: true, customer: { select: { name: true } } },
  });

  for (const c of due) {
    try {
      await prisma.$transaction(async (tx) => {
        if (c.renewalCancelled || !c.autoRenew) {
          await endCustomerContract(tx, c.customerId, {
            endedOn: fromDbDate(c.endDate),
            actorId: null,
            reason: c.renewalCancelled ? "갱신 취소 계약 종료일 경과" : "자동연장 안 함 계약 종료일 경과",
          });
          result.ended.push(c.customer.name);
          return;
        }
        // 오래 실행되지 않았던 경우를 대비해 오늘이 기간 안에 들어올 때까지 연장 (최대 10회)
        let currentId = c.id;
        for (let i = 0; i < 10; i++) {
          const prev = await tx.contract.findUniqueOrThrow({ where: { id: currentId } });
          const period = defaultRenewalPeriod(prev);
          const next = await createRenewal(tx, currentId, { origin: "AUTO_RENEWAL", period, contractDate: period.startDate });
          await recordHistory(tx, {
            customerId: c.customerId,
            event: "contract_auto_renewed",
            content: `계약 자동연장 (종료일까지 조치 없음, 동일 조건): ${formatDate(period.startDate)} ~ ${formatDate(period.endDate)} — 확인 필요`,
            actorId: null,
          });
          currentId = next.id;
          if (period.endDate >= today) break;
        }
        result.autoRenewed.push(c.customer.name);
      });
    } catch (e) {
      if (!(e instanceof ContractStateChanged)) result.errors.push(`${c.customer.name}: ${(e as Error).message}`);
    }
  }
  return result;
}
