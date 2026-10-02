"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { endCustomerContract } from "@/lib/contract-ops";
import type { FieldErrors } from "@/lib/customer-input";
import { formatDate, fromDbDate, isDateString, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";

// 갱신 = 현재 계약의 종료일 변경 (새 계약을 만들지 않음 — 2026-10-02)
type Result = { ok: true } | { ok: false; message: string; errors?: FieldErrors };

const STALE = "계약 상태가 바뀌었습니다. 새로고침하세요.";

function done(customerId: string): Result {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

async function currentContract(contractId: string) {
  const c = await prisma.contract.findUnique({ where: { id: contractId } });
  return c && c.state === "CURRENT" ? c : null;
}

// 계약 갱신·종료일 변경: 늘리면 갱신, 줄이면 종료일 변경(갱신했다가 취소된 경우 원래 날짜로 되돌리기)
// 자동연장 미승인 상태에서 직접 날짜를 정하면 확인한 것으로 봄
export async function setContractEnd(contractId: string, endDate: string): Promise<Result> {
  const user = await requireUser();
  if (!isDateString(endDate)) return { ok: false, message: "종료일을 선택하세요." };
  const c = await currentContract(contractId);
  if (!c) return { ok: false, message: STALE };
  if (endDate < fromDbDate(c.startDate)) return { ok: false, message: "종료일은 계약 시작일 이후여야 합니다." };
  const before = fromDbDate(c.endDate);
  if (before === endDate) return { ok: true };

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.contract.updateMany({
      where: { id: contractId, state: "CURRENT", endDate: c.endDate },
      data: {
        endDate: toDbDate(endDate),
        ...(c.autoRenewedFrom && { autoRenewedFrom: null, autoRenewConfirmedAt: new Date() }),
        version: { increment: 1 },
      },
    });
    if (count === 0) return;
    await recordHistory(tx, {
      customerId: c.customerId,
      event: endDate > before ? "contract_renewed" : "contract_end_changed",
      content: `${endDate > before ? "계약 갱신" : "계약 종료일 변경"}: 종료일 ${formatDate(before)} → ${formatDate(endDate)}${c.renewalCancelled ? " (갱신 취소 상태 — 이 날짜에 계약종료)" : ""}`,
      data: { before, after: endDate },
      actorId: user.id,
    });
  });
  return done(c.customerId);
}

// 계약 갱신 취소 — 종료일이 지나면 매일 배치가 계약종료로 전환
export async function cancelRenewal(contractId: string, reason: string): Promise<Result> {
  const user = await requireUser();
  if (!reason.trim()) return { ok: false, message: "취소 사유를 입력하세요.", errors: { reason: "취소 사유를 입력하세요." } };
  const c = await currentContract(contractId);
  if (!c) return { ok: false, message: STALE };
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.contract.updateMany({
      where: { id: contractId, state: "CURRENT", renewalCancelled: false },
      data: { renewalCancelled: true, renewalCancelReason: reason.trim(), version: { increment: 1 } },
    });
    if (count === 0) return;
    await recordHistory(tx, {
      customerId: c.customerId,
      event: "renewal_cancelled",
      content: `계약 갱신 취소: ${formatDate(fromDbDate(c.endDate))}에 계약종료 예정 (사유: ${reason.trim()})`,
      actorId: user.id,
    });
  });
  return done(c.customerId);
}

// 갱신 취소 철회 → 다시 '갱신 확인 필요'로
export async function withdrawCancel(contractId: string): Promise<Result> {
  const user = await requireUser();
  const c = await currentContract(contractId);
  if (!c || !c.renewalCancelled) return { ok: false, message: STALE };
  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: contractId },
      data: { renewalCancelled: false, renewalCancelReason: null, version: { increment: 1 } },
    });
    await recordHistory(tx, { customerId: c.customerId, event: "renewal_cancel_withdrawn", content: "갱신 취소 철회", actorId: user.id });
  });
  return done(c.customerId);
}

// 자동연장 승인 → 배지 제거, 연장된 종료일 유지
export async function confirmAutoRenew(contractId: string): Promise<Result> {
  const user = await requireUser();
  const c = await currentContract(contractId);
  if (!c?.autoRenewedFrom) return { ok: false, message: STALE };
  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: contractId },
      data: { autoRenewedFrom: null, autoRenewConfirmedAt: new Date(), version: { increment: 1 } },
    });
    await recordHistory(tx, {
      customerId: c.customerId,
      event: "auto_renew_confirmed",
      content: `자동연장 승인: 종료일 ${formatDate(fromDbDate(c.endDate))}`,
      actorId: user.id,
    });
  });
  return done(c.customerId);
}

// 자동연장 → 계약 종료로 변경: 종료일을 자동연장 전 날짜로 되돌리고 그 날짜로 계약종료
export async function revertAutoRenew(contractId: string): Promise<Result> {
  const user = await requireUser();
  const c = await currentContract(contractId);
  if (!c?.autoRenewedFrom) return { ok: false, message: STALE };
  const original = fromDbDate(c.autoRenewedFrom);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.contract.updateMany({
      where: { id: contractId, state: "CURRENT", autoRenewedFrom: c.autoRenewedFrom },
      data: { endDate: c.autoRenewedFrom!, autoRenewedFrom: null, version: { increment: 1 } },
    });
    if (count === 0) return;
    await endCustomerContract(tx, c.customerId, {
      endedOn: original,
      actorId: user.id,
      reason: `자동연장 취소 — 종료일 ${formatDate(fromDbDate(c.endDate))} → ${formatDate(original)}로 되돌려 계약 종료`,
    });
  });
  return done(c.customerId);
}
