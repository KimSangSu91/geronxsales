"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ContractInput } from "@/lib/contract-input";
import type { FieldErrors } from "@/lib/customer-input";
import { formatDate, fromDbDate, isDateString, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";
import { emptyTransitionInput, type MissingItem } from "@/lib/status-rules";
import { changeStatus } from "../status/actions";
import { createContract } from "./actions";

type Fail = { ok: false; message: string; errors?: FieldErrors };

// 체험 연장: 종료일 변경 → 배지 제거 후 새 종료일 기준으로 다시 알림 (기능정의서 4-5-1)
export async function extendTrial(trialId: string, endDate: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!isDateString(endDate)) return { ok: false, message: "새 종료일을 선택하세요." };
  const t = await prisma.trial.findUnique({ where: { id: trialId } });
  if (!t || t.result !== "IN_PROGRESS") return { ok: false, message: "진행 중인 체험이 아닙니다. 새로고침하세요." };
  const before = fromDbDate(t.endDate);
  if (endDate <= before) return { ok: false, message: "새 종료일은 기존 종료일 이후여야 합니다." };
  await prisma.$transaction(async (tx) => {
    await tx.trial.update({ where: { id: trialId }, data: { endDate: toDbDate(endDate), version: { increment: 1 } } });
    await recordHistory(tx, {
      customerId: t.customerId,
      event: "trial_extended",
      content: `체험 연장: 종료일 ${formatDate(before)} → ${formatDate(endDate)}`,
      actorId: user.id,
    });
  });
  revalidatePath(`/customers/${t.customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

// 계약 전환: 계약 등록 → 도입준비 전환 시도 (다른 필수 항목이 비어 있으면 계약은 저장된 채 체험중 유지 + 누락 목록)
export async function convertTrial(
  customerId: string,
  input: ContractInput,
): Promise<{ ok: true; converted: boolean; missing?: MissingItem[]; message?: string } | Fail> {
  await requireUser();
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { status: true } });
  if (c?.status !== "TRIAL") return { ok: false, message: "체험중 상태가 아닙니다. 새로고침하세요." };

  const hasContract = await prisma.contract.findFirst({ where: { customerId, state: "CURRENT" }, select: { id: true } });
  if (!hasContract) {
    const created = await createContract(customerId, input);
    if (!created.ok) return { ok: false, message: created.message ?? "입력 내용을 확인하세요.", errors: created.errors };
  }
  const r = await changeStatus(customerId, "TRIAL", "ONBOARDING", emptyTransitionInput());
  if (r.ok) return { ok: true, converted: true };
  if (r.missing) return { ok: true, converted: false, missing: r.missing };
  return { ok: true, converted: false, message: r.message };
}
