import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { createClosure } from "@/lib/closure";
import { formatDate, fromDbDate, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import { contractMonths } from "@/lib/renewal";

type Tx = Prisma.TransactionClient;

// 갱신·자동연장 처리 중 그 사이 다른 처리가 먼저 된 경우
export class ContractStateChanged extends Error {
  constructor() {
    super("계약 상태가 바뀌었습니다. 새로고침하세요.");
  }
}

// 연장 기간(개월): 계약의 자동연장 기간, 없으면 계약 기간과 같은 길이
export function renewMonths(c: { startDate: Date; endDate: Date; autoRenewMonths: number | null }) {
  return c.autoRenewMonths ?? contractMonths(fromDbDate(c.startDate), fromDbDate(c.endDate));
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
