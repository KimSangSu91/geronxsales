import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { createClosure } from "@/lib/closure";
import { formatDate, fromDbDate, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import { contractMonths, renewalPeriod } from "@/lib/renewal";

type Tx = Prisma.TransactionClient;

// 갱신·자동연장 처리 중 그 사이 다른 처리가 먼저 된 경우
export class ContractStateChanged extends Error {
  constructor() {
    super("계약 상태가 바뀌었습니다. 새로고침하세요.");
  }
}

// 갱신 기간 기본값: 계약의 자동연장 기간, 없으면 이전 계약과 같은 길이
export function defaultRenewalPeriod(prev: { startDate: Date; endDate: Date; autoRenewMonths: number | null }) {
  const start = fromDbDate(prev.startDate);
  const end = fromDbDate(prev.endDate);
  return renewalPeriod(end, prev.autoRenewMonths ?? contractMonths(start, end));
}

/**
 * 새 계약(갱신) 만들기 — 이전 계약은 '이전 계약'(PAST)으로
 * - 동일 조건: 유형·수량·단가·납부·관리비·자동연장 설정을 옮김. 가입비·일시 비용은 옮기지 않음(한 번만 받는 돈)
 *   구축 장비 일시납은 청구월이 지난 달로 남아 다시 청구되지 않고, 분납은 남은 회차만 이어짐 (lib/billing.ts는 절대 월 기준)
 * - 변경 있음: data로 받은 값 사용
 * - 직접 추가한 월 비용은 새 계약으로 복사
 */
export async function createRenewal(
  tx: Tx,
  prevId: string,
  opts: {
    origin: "RENEWAL" | "AUTO_RENEWAL";
    period: { startDate: string; endDate: string };
    data?: Omit<Prisma.ContractUncheckedCreateInput, "customerId" | "contractDate" | "startDate" | "endDate">; // 변경 있음
    contractDate: string;
  },
) {
  const prev = await tx.contract.findUniqueOrThrow({ where: { id: prevId }, include: { charges: true } });
  const { count } = await tx.contract.updateMany({
    where: { id: prevId, state: "CURRENT" },
    data: { state: "PAST", version: { increment: 1 } },
  });
  if (count === 0) throw new ContractStateChanged();

  const same = {
    contractUsers: prev.contractUsers,
    autoRenew: prev.autoRenew,
    autoRenewMonths: prev.autoRenewMonths,
    qtyHub: prev.qtyHub,
    qtyBand: prev.qtyBand,
    qtyCharger: prev.qtyCharger,
    contractType: prev.contractType,
    unitPriceHub: prev.unitPriceHub,
    unitPriceBand: prev.unitPriceBand,
    unitPriceCharger: prev.unitPriceCharger,
    purchasePayment: prev.purchasePayment,
    purchaseBillingMonth: prev.purchaseBillingMonth,
    installmentMonths: prev.installmentMonths,
    managementFee: prev.managementFee,
    managementFeeStart: prev.managementFeeStart,
    joinFee: null,
  };
  const next = await tx.contract.create({
    data: {
      ...(opts.data ?? same),
      customerId: prev.customerId,
      state: "CURRENT",
      origin: opts.origin,
      previousId: prev.id,
      contractDate: toDbDate(opts.contractDate),
      startDate: toDbDate(opts.period.startDate),
      endDate: toDbDate(opts.period.endDate),
      renewalCancelled: false,
      renewalCancelReason: null,
      autoRenewConfirmedAt: null,
    },
  });
  const monthly = prev.charges.filter((c) => c.type === "MONTHLY");
  if (monthly.length) {
    await tx.contractCharge.createMany({
      data: monthly.map((c) => ({ contractId: next.id, type: c.type, name: c.name, amount: c.amount, isFree: c.isFree, freeReason: c.freeReason })),
    });
  }
  return next;
}

/**
 * 계약종료 처리 (갱신 취소·연장 안 함 계약의 종료일 경과, 자동연장 → 계약 종료로 변경)
 * 상태 계약종료 + 종료일 + 회수·종료 체크리스트 + 히스토리
 */
export async function endCustomerContract(
  tx: Tx,
  customerId: string,
  opts: { endedOn: string; actorId: string | null; reason: string },
) {
  const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { status: true } });
  if (c.status === "ENDED") return false;
  await tx.customer.update({
    where: { id: customerId },
    data: { status: "ENDED", statusChangedAt: new Date(), statusReason: null, endedOn: toDbDate(opts.endedOn) },
  });
  await createClosure(tx, customerId, "ENDED");
  await recordHistory(tx, {
    customerId,
    event: "status_changed",
    content: `상태 변경: ${CUSTOMER_STATUS_LABEL[c.status]} → 계약종료 (종료일 ${formatDate(opts.endedOn)} · ${opts.reason} · 회수·종료 체크리스트 생성)`,
    data: { from: c.status, to: "ENDED", endedOn: opts.endedOn, reason: opts.reason },
    actorId: opts.actorId,
  });
  return true;
}
