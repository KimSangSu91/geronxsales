"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { recoveryErrors, recoveryIncompleteReason, type RecoveryInput } from "@/lib/checklist-rules";
import { formatDate, formatDateTimeKst, fromDbDate, isDateString, kstStartOfDay, todayKst, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { ConflictError, saveWithVersion } from "@/lib/optimistic";
import { prisma } from "@/lib/prisma";
import { DEVICE_KIND_LABEL } from "./checklist-shared";

type Result = { ok: true } | { ok: false; message?: string; errors?: Record<string, string>; conflict?: boolean };

function done(customerId: string): Result {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

// 체크·해제 — 충돌 검사 없이 즉시 저장, 완료일·완료자 기록/삭제
export async function toggleEntry(entryId: string, checked: boolean): Promise<Result> {
  const user = await requireUser();
  const e = await prisma.checklistEntry.findUnique({
    where: { id: entryId },
    include: { item: true, closure: { include: { recovery: true } } },
  });
  if (!e) return { ok: false, message: "항목을 찾을 수 없습니다. 새로고침하세요." };
  if (e.done === checked) return done(e.customerId);

  // 장비 회수는 회수 내역 입력 후 체크 가능
  if (checked && e.item.code === "recovery" && e.closure) {
    const reason = recoveryIncompleteReason({
      recoveredOn: e.closure.recoveredOn ? fromDbDate(e.closure.recoveredOn) : null,
      lines: e.closure.recovery,
    });
    if (reason) return { ok: false, message: reason };
  }

  await prisma.$transaction(async (tx) => {
    await tx.checklistEntry.update({
      where: { id: entryId },
      data: checked ? { done: true, doneAt: new Date(), doneById: user.id } : { done: false, doneAt: null, doneById: null },
    });
    // 회수·종료 체크리스트: 전체 완료 여부 갱신
    if (e.closureId) {
      const remaining = await tx.checklistEntry.count({ where: { closureId: e.closureId, done: false } });
      await tx.closure.update({ where: { id: e.closureId }, data: { completedAt: remaining === 0 ? new Date() : null } });
    }
    const group = e.closureId ? "회수·종료 체크리스트" : "도입 체크리스트";
    await recordHistory(tx, {
      customerId: e.customerId,
      event: checked ? "checklist_checked" : "checklist_unchecked",
      content: `${group} ${checked ? "완료" : "해제"}: ${e.item.label}`,
      data: { itemCode: e.item.code, closureId: e.closureId },
      actorId: user.id,
    });
  });
  return done(e.customerId);
}

// 완료일 수정 — 실제 완료한 날보다 늦게 체크한 경우 (오늘 이후 날짜 불가), 완료자는 유지
export async function updateEntryDate(entryId: string, date: string): Promise<Result> {
  const user = await requireUser();
  if (!isDateString(date)) return { ok: false, message: "날짜를 다시 선택하세요." };
  if (date > todayKst()) return { ok: false, message: "완료일은 오늘 이후로 지정할 수 없습니다." };
  const e = await prisma.checklistEntry.findUnique({ where: { id: entryId }, include: { item: true } });
  if (!e) return { ok: false, message: "항목을 찾을 수 없습니다. 새로고침하세요." };
  if (!e.done) return { ok: false, message: "완료된 항목만 완료일을 바꿀 수 있습니다." };

  // 이관 데이터는 완료일이 비어 있을 수 있음
  const before = e.doneAt ? formatDateTimeKst(e.doneAt).slice(0, 10) : "";
  if (before === date) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.checklistEntry.update({ where: { id: entryId }, data: { doneAt: kstStartOfDay(date) } });
    await recordHistory(tx, {
      customerId: e.customerId,
      event: "checklist_date_changed",
      content: `${e.closureId ? "회수·종료" : "도입"} 체크리스트 완료일 수정: ${e.item.label} ${before ? formatDate(before) : "-"} → ${formatDate(date)}`,
      actorId: user.id,
    });
  });
  return done(e.customerId);
}

// 설치 예정일 — 고객사 정보 수정이므로 version 충돌 검사
export async function updateInstallDate(customerId: string, version: number, installDate: string): Promise<Result> {
  const user = await requireUser();
  if (installDate && !isDateString(installDate)) return { ok: false, message: "날짜를 다시 선택하세요." };
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { installDate: true } });
  if (!c) return { ok: false, message: "고객사를 찾을 수 없습니다." };

  const before = c.installDate ? fromDbDate(c.installDate) : "";
  if (before === installDate) return { ok: true };
  const show = (d: string) => (d ? formatDate(d) : "-");

  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() =>
        tx.customer.updateMany({
          where: { id: customerId, version },
          data: { installDate: installDate ? toDbDate(installDate) : null, version: { increment: 1 } },
        }),
      );
      await recordHistory(tx, {
        customerId,
        event: "schedule_updated",
        content: `설치 예정일 수정: ${show(before)} → ${show(installDate)}`,
        actorId: user.id,
      });
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      return { ok: false, conflict: true, message: "다른 사용자가 먼저 고객사 정보를 수정했습니다. 새로고침 후 다시 입력하세요." };
    }
    throw err;
  }
  return done(customerId);
}

// 회수 내역 저장: 기기별 제공·회수 수량, 미회수 사유, 회수일
export async function saveRecovery(closureId: string, input: RecoveryInput): Promise<Result> {
  const user = await requireUser();
  const closure = await prisma.closure.findUnique({ where: { id: closureId }, include: { recovery: true } });
  if (!closure) return { ok: false, message: "체크리스트를 찾을 수 없습니다. 새로고침하세요." };

  const errors = recoveryErrors(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: "입력 내용을 확인하세요." };

  const lines = input.lines.filter((l) => closure.recovery.some((r) => r.id === l.id));
  const summary = lines
    .map((l) => {
      const r = closure.recovery.find((x) => x.id === l.id)!;
      const name = r.kind === "OTHER" ? (r.label ?? "기타") : DEVICE_KIND_LABEL[r.kind];
      return `${name} ${l.recoveredQty}/${l.providedQty}${l.missingReason ? `(${l.missingReason})` : ""}`;
    })
    .join(", ");

  await prisma.$transaction(async (tx) => {
    for (const l of lines) {
      const recovered = Number(l.recoveredQty);
      const provided = Number(l.providedQty);
      await tx.recoveryLine.update({
        where: { id: l.id },
        data: {
          providedQty: provided,
          recoveredQty: recovered,
          // 모두 회수했으면 사유 비움
          missingReason: recovered < provided ? l.missingReason.trim() || null : null,
        },
      });
    }
    await tx.closure.update({
      where: { id: closureId },
      data: { recoveredOn: input.recoveredOn ? toDbDate(input.recoveredOn) : null },
    });
    await recordHistory(tx, {
      customerId: closure.customerId,
      event: "recovery_saved",
      content: `회수 내역 저장: ${summary}${input.recoveredOn ? ` · 회수일 ${formatDate(input.recoveredOn)}` : ""}`,
      actorId: user.id,
    });
  });
  return done(closure.customerId);
}

// 늘케어 계정 비활성화 항목: 사용 중 서비스 계정 일괄 비활성 처리
export async function deactivateAllAccounts(customerId: string): Promise<Result> {
  const user = await requireUser();
  const accounts = await prisma.serviceAccount.findMany({
    where: { customerId, status: "IN_USE" },
    select: { id: true, loginId: true },
  });
  if (!accounts.length) return { ok: false, message: "사용 중인 서비스 계정이 없습니다." };

  await prisma.$transaction(async (tx) => {
    await tx.serviceAccount.updateMany({
      where: { id: { in: accounts.map((a) => a.id) }, status: "IN_USE" },
      data: { status: "INACTIVE", deactivatedOn: toDbDate(todayKst()), version: { increment: 1 } },
    });
    await recordHistory(tx, {
      customerId,
      event: "accounts_deactivated",
      content: `서비스 계정 일괄 비활성화 (${accounts.length}개): ${accounts.map((a) => a.loginId).join(", ")}`,
      actorId: user.id,
    });
  });
  return done(customerId);
}
