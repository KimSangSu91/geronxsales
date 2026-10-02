import "server-only";
import { ContractStateChanged, endCustomerContract, renewMonths } from "@/lib/contract-ops";
import { extendEnd } from "@/lib/renewal";
import { formatDate, fromDbDate, todayKst, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { syncAlerts } from "@/lib/alerts";
import { ensureMonthlyInvoices } from "@/lib/invoice";
import { prisma } from "@/lib/prisma";

// 매일 배치 (데이터모델 4장) — 여러 번 실행해도 결과가 같음(이미 처리한 건은 조건에서 빠짐)
// ① 갱신 취소·연장 안 함 계약의 종료일 경과 → 계약종료 + 회수·종료 체크리스트
// ② 미조치 계약의 종료일 경과 → 종료일을 설정 기간만큼 자동연장 (자동연장 미승인 배지)
// ③ 사용중 고객사의 이번 달 청구 건 생성 (이미 있으면 건너뜀)
// ④ 알림 생성·해제
export async function runDailyBatch(today = todayKst()) {
  const result = {
    ended: [] as string[],
    autoRenewed: [] as string[],
    invoices: [] as string[],
    alerts: { created: 0, resolved: 0 },
    errors: [] as string[],
  };

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
        // 자동연장 = 종료일을 설정 기간만큼 연장 (새 계약을 만들지 않음), 연장 전 종료일을 보관 → 미승인 배지
        // 오래 실행되지 않았던 경우를 대비해 오늘이 기간 안에 들어올 때까지 연장 (최대 10회)
        const contract = await tx.contract.findUniqueOrThrow({ where: { id: c.id } });
        const from = fromDbDate(contract.endDate);
        const months = renewMonths(contract);
        let end = from;
        for (let i = 0; i < 10 && end < today; i++) end = extendEnd(end, months);
        const { count } = await tx.contract.updateMany({
          where: { id: c.id, state: "CURRENT", endDate: contract.endDate },
          data: {
            endDate: toDbDate(end),
            // 이미 미승인 상태에서 또 연장되면 처음 자동연장 전 종료일을 유지
            autoRenewedFrom: contract.autoRenewedFrom ?? contract.endDate,
            autoRenewConfirmedAt: null,
            version: { increment: 1 },
          },
        });
        if (count === 0) throw new ContractStateChanged();
        await recordHistory(tx, {
          customerId: c.customerId,
          event: "contract_auto_renewed",
          content: `계약 자동연장 (종료일까지 조치 없음): 종료일 ${formatDate(from)} → ${formatDate(end)} — 확인 필요`,
          actorId: null,
        });
        result.autoRenewed.push(c.customer.name);
      });
    } catch (e) {
      if (!(e instanceof ContractStateChanged)) result.errors.push(`${c.customer.name}: ${(e as Error).message}`);
    }
  }
  // ③ 청구 건 (①② 처리 후 — 계약종료된 고객사는 제외됨)
  try {
    result.invoices = await ensureMonthlyInvoices(today.slice(0, 7));
  } catch (e) {
    result.errors.push(`청구 건 생성: ${(e as Error).message}`);
  }
  // ④ 알림
  try {
    result.alerts = await syncAlerts(today);
  } catch (e) {
    result.errors.push(`알림: ${(e as Error).message}`);
  }
  return result;
}
