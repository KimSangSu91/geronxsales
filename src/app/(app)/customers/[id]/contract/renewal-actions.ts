"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { contractDataOf, validateContract, type ContractInput } from "@/lib/contract-input";
import { ContractStateChanged, createRenewal, defaultRenewalPeriod, endCustomerContract } from "@/lib/contract-ops";
import type { FieldErrors } from "@/lib/customer-input";
import { formatDate, fromDbDate, isDateString, todayKst, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";

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

const range = (s: string, e: string) => `${formatDate(s)} ~ ${formatDate(e)}`;

// 계약 갱신 완료 — 동일 조건 (계약에 설정한 연장 기간만큼)
export async function renewSame(contractId: string): Promise<Result> {
  const user = await requireUser();
  const prev = await currentContract(contractId);
  if (!prev) return { ok: false, message: STALE };
  const period = defaultRenewalPeriod(prev);
  try {
    await prisma.$transaction(async (tx) => {
      await createRenewal(tx, contractId, { origin: "RENEWAL", period, contractDate: todayKst() });
      await recordHistory(tx, {
        customerId: prev.customerId,
        event: "contract_renewed",
        content: `계약 갱신 (동일 조건): ${range(period.startDate, period.endDate)}`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ContractStateChanged) return { ok: false, message: STALE };
    throw e;
  }
  return done(prev.customerId);
}

// 계약 갱신 완료 — 변경 있음 (계약 폼 내용으로 새 계약)
export async function renewChanged(contractId: string, input: ContractInput): Promise<Result> {
  const user = await requireUser();
  const prev = await currentContract(contractId);
  if (!prev) return { ok: false, message: STALE };
  const errors = validateContract(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: "입력 내용을 확인하세요." };
  if (input.startDate <= fromDbDate(prev.startDate)) {
    return { ok: false, errors: { startDate: "새 계약 시작일은 이전 계약 시작일 이후여야 합니다." }, message: "입력 내용을 확인하세요." };
  }
  // 기간·계약일은 opts로 따로 넘김
  const data: Partial<ReturnType<typeof contractDataOf>> = contractDataOf(input);
  delete data.contractDate;
  delete data.startDate;
  delete data.endDate;
  try {
    await prisma.$transaction(async (tx) => {
      await createRenewal(tx, contractId, {
        origin: "RENEWAL",
        period: { startDate: input.startDate, endDate: input.endDate },
        contractDate: input.contractDate,
        data: data as Omit<ReturnType<typeof contractDataOf>, "contractDate" | "startDate" | "endDate">,
      });
      await recordHistory(tx, {
        customerId: prev.customerId,
        event: "contract_renewed",
        content: `계약 갱신 (변경 있음): ${range(input.startDate, input.endDate)} · ${input.contractUsers}명`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ContractStateChanged) return { ok: false, message: STALE };
    throw e;
  }
  return done(prev.customerId);
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

// 계약 기간 변경 (갱신 취소된 계약의 종료일 변경)
export async function changeEndDate(contractId: string, endDate: string): Promise<Result> {
  const user = await requireUser();
  if (!isDateString(endDate)) return { ok: false, message: "종료일을 선택하세요." };
  const c = await currentContract(contractId);
  if (!c || !c.renewalCancelled) return { ok: false, message: STALE };
  if (endDate < fromDbDate(c.startDate)) return { ok: false, message: "종료일은 계약 시작일 이후여야 합니다." };
  const before = fromDbDate(c.endDate);
  if (before === endDate) return { ok: true };
  await prisma.$transaction(async (tx) => {
    await tx.contract.update({ where: { id: contractId }, data: { endDate: toDbDate(endDate), version: { increment: 1 } } });
    await recordHistory(tx, {
      customerId: c.customerId,
      event: "contract_end_changed",
      content: `계약 기간 변경: 종료일 ${formatDate(before)} → ${formatDate(endDate)} (이 날짜에 계약종료)`,
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

// 자동연장 승인 → 배지 제거, 계약 유지
export async function confirmAutoRenew(contractId: string): Promise<Result> {
  const user = await requireUser();
  const c = await currentContract(contractId);
  if (!c || c.origin !== "AUTO_RENEWAL" || c.autoRenewConfirmedAt) return { ok: false, message: STALE };
  await prisma.$transaction(async (tx) => {
    await tx.contract.update({ where: { id: contractId }, data: { autoRenewConfirmedAt: new Date(), version: { increment: 1 } } });
    await recordHistory(tx, {
      customerId: c.customerId,
      event: "auto_renew_confirmed",
      content: `자동연장 승인: ${range(fromDbDate(c.startDate), fromDbDate(c.endDate))}`,
      actorId: user.id,
    });
  });
  return done(c.customerId);
}

// 자동연장 → 계약 종료로 변경: 자동 생성 계약 취소(VOID), 이전 계약을 현재 계약으로 되돌리고 그 종료일로 계약종료
export async function revertAutoRenew(contractId: string): Promise<Result> {
  const user = await requireUser();
  const c = await currentContract(contractId);
  if (!c || c.origin !== "AUTO_RENEWAL" || c.autoRenewConfirmedAt || !c.previousId) return { ok: false, message: STALE };
  const prev = await prisma.contract.findUnique({ where: { id: c.previousId } });
  if (!prev) return { ok: false, message: STALE };
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.contract.updateMany({
      where: { id: contractId, state: "CURRENT" },
      data: { state: "VOID", version: { increment: 1 } },
    });
    if (count === 0) throw new ContractStateChanged();
    await tx.contract.update({ where: { id: prev.id }, data: { state: "CURRENT", version: { increment: 1 } } });
    await endCustomerContract(tx, c.customerId, {
      endedOn: fromDbDate(prev.endDate),
      actorId: user.id,
      reason: "자동연장 취소 후 계약 종료로 변경",
    });
  }).catch((e) => {
    if (!(e instanceof ContractStateChanged)) throw e;
  });
  return done(c.customerId);
}
