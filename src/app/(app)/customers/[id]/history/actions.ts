"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { FieldErrors } from "@/lib/customer-input";
import { formatDate, toDbDate, fromDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { validateActivity, type ActivityInput } from "@/lib/history-input";
import { ACTIVITY_TYPE_LABEL } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

type Result = { ok: true } | { ok: false; errors?: FieldErrors; message?: string };

const CHECK = "입력 내용을 확인하세요.";

function done(customerId: string): Result {
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

// 수동 기록(영업 활동) 추가 — 충돌 검사 없이 즉시 저장
export async function addActivity(customerId: string, input: ActivityInput): Promise<Result> {
  const user = await requireUser();
  const errors = validateActivity(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };
  const exists = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!exists) return { ok: false, message: "고객사를 찾을 수 없습니다." };

  await prisma.history.create({
    data: {
      customerId,
      kind: "MANUAL",
      event: "activity",
      activityType: input.activityType || "OTHER",
      occurredOn: toDbDate(input.occurredOn),
      content: input.content.trim(),
      actorId: user.id,
    },
  });
  return done(customerId);
}

// 본인 수동 기록만 대상 (자동 기록·타인 기록은 관리자도 불가)
async function ownManual(historyId: string, userId: string) {
  const h = await prisma.history.findUnique({ where: { id: historyId } });
  if (!h) return { error: "이미 삭제된 기록입니다. 새로고침하세요." } as const;
  if (h.kind !== "MANUAL" || h.actorId !== userId) return { error: "본인이 작성한 기록만 수정·삭제할 수 있습니다." } as const;
  return { h } as const;
}

export async function updateActivity(historyId: string, input: ActivityInput): Promise<Result> {
  const user = await requireUser();
  const found = await ownManual(historyId, user.id);
  if ("error" in found) return { ok: false, message: found.error };
  const errors = validateActivity(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  await prisma.history.update({
    where: { id: historyId },
    data: {
      activityType: input.activityType || "OTHER",
      occurredOn: toDbDate(input.occurredOn),
      content: input.content.trim(),
      editedAt: new Date(),
    },
  });
  return done(found.h.customerId);
}

export async function deleteActivity(historyId: string): Promise<Result> {
  const user = await requireUser();
  const found = await ownManual(historyId, user.id);
  if ("error" in found) return { ok: false, message: found.error };
  const { h } = found;

  const preview = h.content.length > 30 ? `${h.content.slice(0, 30)}…` : h.content;
  await prisma.$transaction(async (tx) => {
    await tx.history.delete({ where: { id: historyId } });
    await recordHistory(tx, {
      customerId: h.customerId,
      event: "activity_deleted",
      content: `수동 기록 삭제: [${h.activityType ? ACTIVITY_TYPE_LABEL[h.activityType] : "기타"}] ${formatDate(fromDbDate(h.occurredOn))} ${preview}`,
      data: { activityType: h.activityType, occurredOn: fromDbDate(h.occurredOn), content: h.content },
      actorId: user.id,
    });
  });
  return done(h.customerId);
}

// 히스토리 패널 접힘 상태 — 사용자별로 기억
export async function setHistoryPanelCollapsed(collapsed: boolean): Promise<void> {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { historyPanelCollapsed: collapsed } });
}
