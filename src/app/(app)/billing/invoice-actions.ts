"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { parseAmount } from "@/lib/contract-input";
import { formatDate, fromDbDate, isDateString, todayKst, toDbDate } from "@/lib/date";
import { ALLOWED_TYPES, DOCUMENT_BUCKET, fileProblem } from "@/lib/document-rules";
import { recordHistory } from "@/lib/history";
import { ensureMonthlyInvoices } from "@/lib/invoice";
import { INVOICE_STATUS_LABEL } from "@/lib/labels";
import { formatWon } from "@/lib/money";
import { ConflictError, saveWithVersion } from "@/lib/optimistic";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; message: string; conflict?: boolean };
const STALE = "다른 사용자가 먼저 이 청구 건을 수정했습니다. 새로고침 후 다시 시도하세요.";

const monthText = (d: Date) => fromDbDate(d).slice(0, 7).replace("-", ".");

function done(customerId: string) {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/billing");
  revalidatePath("/");
}

// 상태·발행일·입금일·메모 변경 (표에서 바로 — version 충돌 검사)
export async function updateInvoice(
  invoiceId: string,
  version: number,
  patch: { status?: InvoiceStatus; issuedOn?: string; paidOn?: string; memo?: string },
): Promise<Result> {
  const user = await requireUser();
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { ok: false, message: "청구 건을 찾을 수 없습니다. 새로고침하세요." };
  if (patch.status && !Object.hasOwn(INVOICE_STATUS_LABEL, patch.status)) return { ok: false, message: "잘못된 상태입니다." };
  for (const k of ["issuedOn", "paidOn"] as const) {
    if (patch[k] !== undefined && patch[k] !== "" && !isDateString(patch[k]!)) return { ok: false, message: "날짜를 다시 선택하세요." };
  }

  const data: Record<string, unknown> = {};
  const changes: string[] = [];
  const dateText = (d: Date | null) => (d ? formatDate(fromDbDate(d)) : "-");
  if (patch.status !== undefined && patch.status !== inv.status) {
    data.status = patch.status;
    changes.push(`상태 ${INVOICE_STATUS_LABEL[inv.status]} → ${INVOICE_STATUS_LABEL[patch.status]}`);
  }
  for (const [k, label] of [
    ["issuedOn", "발행일"],
    ["paidOn", "입금일"],
  ] as const) {
    if (patch[k] === undefined) continue;
    const next = patch[k] ? toDbDate(patch[k]!) : null;
    if ((next?.getTime() ?? null) !== (inv[k]?.getTime() ?? null)) {
      data[k] = next;
      changes.push(`${label} ${dateText(inv[k])} → ${dateText(next)}`);
    }
  }
  if (patch.memo !== undefined && (patch.memo.trim() || null) !== inv.memo) {
    data.memo = patch.memo.trim() || null;
    changes.push("메모 수정");
  }
  if (!changes.length) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() => tx.invoice.updateMany({ where: { id: invoiceId, version }, data: { ...data, version: { increment: 1 } } }));
      await recordHistory(tx, {
        customerId: inv.customerId,
        event: "invoice_updated",
        content: `${monthText(inv.billingMonth)} 청구: ${changes.join(", ")}`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, message: STALE, conflict: true };
    throw e;
  }
  done(inv.customerId);
  return { ok: true };
}

// 금액 조정 (사유 필수) — 비우면 조정 취소(예정 금액으로)
export async function adjustInvoice(invoiceId: string, version: number, amount: string, reason: string): Promise<Result> {
  const user = await requireUser();
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { ok: false, message: "청구 건을 찾을 수 없습니다. 새로고침하세요." };
  const clear = !amount.trim();
  const value = clear ? null : parseAmount(amount);
  if (!clear && (Number.isNaN(value) || value! < 0)) return { ok: false, message: "금액을 숫자로 입력하세요." };
  if (!clear && !reason.trim()) return { ok: false, message: "조정 사유를 입력하세요." };
  const before = inv.adjustedAmount ?? inv.plannedAmount;
  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() =>
        tx.invoice.updateMany({
          where: { id: invoiceId, version },
          data: { adjustedAmount: value, adjustReason: clear ? null : reason.trim(), version: { increment: 1 } },
        }),
      );
      await recordHistory(tx, {
        customerId: inv.customerId,
        event: "invoice_adjusted",
        content: clear
          ? `${monthText(inv.billingMonth)} 청구 금액 조정 취소: ${formatWon(before)}원 → 예정 ${formatWon(inv.plannedAmount)}원`
          : `${monthText(inv.billingMonth)} 청구 금액 조정: ${formatWon(before)}원 → ${formatWon(value!)}원 (사유: ${reason.trim()})`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, message: STALE, conflict: true };
    throw e;
  }
  done(inv.customerId);
  return { ok: true };
}

// ───────── 세금계산서 (청구 건당 파일 1개, 문서와 같은 방식: 브라우저 → Storage 직접 업로드) ─────────

export async function prepareTaxInvoiceUpload(
  invoiceId: string,
  file: { name: string; size: number; type: string },
): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  await requireUser();
  const problem = fileProblem(file);
  if (problem) return { ok: false, message: problem };
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { customerId: true } });
  if (!inv) return { ok: false, message: "청구 건을 찾을 수 없습니다. 새로고침하세요." };
  const path = `customers/${inv.customerId}/TAX_INVOICE/${randomUUID()}.${ALLOWED_TYPES[file.type]}`;
  const { data, error } = await createAdminClient().storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "업로드를 준비하지 못했습니다. 다시 시도하세요." };
  return { ok: true, path: data.path, token: data.token };
}

// 업로드 완료: 기존 세금계산서는 교체(삭제), 청구 전이면 → 청구 완료 + 발행일 오늘 (화면정의서 4-3)
export async function completeTaxInvoiceUpload(invoiceId: string, path: string, fileName: string): Promise<Result> {
  const user = await requireUser();
  const storage = createAdminClient().storage.from(DOCUMENT_BUCKET);
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { documents: true } });
  if (!inv || !path.startsWith(`customers/${inv.customerId}/TAX_INVOICE/`)) {
    await storage.remove([path]);
    return { ok: false, message: "잘못된 요청입니다." };
  }
  const { data: info } = await storage.info(path);
  const problem = info ? fileProblem({ name: fileName, size: info.size ?? 0, type: info.contentType ?? "" }) : "업로드된 파일을 찾을 수 없습니다.";
  if (problem) {
    await storage.remove([path]);
    return { ok: false, message: problem };
  }
  const old = inv.documents[0];
  const toBilled = inv.status === "BEFORE";
  await prisma.$transaction(async (tx) => {
    if (old) await tx.document.delete({ where: { id: old.id } });
    await tx.document.create({
      data: {
        customerId: inv.customerId,
        slot: "TAX_INVOICE",
        invoiceId,
        groupId: randomUUID(),
        fileName: fileName.slice(0, 200),
        storagePath: path,
        mimeType: info!.contentType ?? "",
        size: info!.size ?? 0,
        uploadedById: user.id,
      },
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        ...(toBilled && { status: "BILLED" }),
        ...(!inv.issuedOn && { issuedOn: toDbDate(todayKst()) }),
        version: { increment: 1 },
      },
    });
    await recordHistory(tx, {
      customerId: inv.customerId,
      event: old ? "tax_invoice_replaced" : "tax_invoice_uploaded",
      content: `${monthText(inv.billingMonth)} 세금계산서 ${old ? "교체" : "업로드"}: ${fileName}${toBilled ? " → 청구 완료" : ""}`,
      actorId: user.id,
    });
  });
  if (old) await storage.remove([old.storagePath]);
  done(inv.customerId);
  return { ok: true };
}

export async function deleteTaxInvoice(invoiceId: string): Promise<Result> {
  const user = await requireUser();
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { documents: true } });
  const doc = inv?.documents[0];
  if (!inv || !doc) return { ok: false, message: "이미 삭제된 파일입니다. 새로고침하세요." };
  await prisma.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: doc.id } });
    await recordHistory(tx, {
      customerId: inv.customerId,
      event: "tax_invoice_deleted",
      content: `${monthText(inv.billingMonth)} 세금계산서 삭제: ${doc.fileName}`,
      actorId: user.id,
    });
  });
  await createAdminClient().storage.from(DOCUMENT_BUCKET).remove([doc.storagePath]);
  done(inv.customerId);
  return { ok: true };
}

// 이번 달 청구 건 만들기 (매일 배치와 같은 처리 — 배포 전·배치 실패 대비, 이미 있으면 건너뜀)
export async function createMissingInvoices(): Promise<{ ok: true; created: string[] }> {
  await requireUser();
  const created = await ensureMonthlyInvoices(todayKst().slice(0, 7));
  revalidatePath("/billing");
  revalidatePath("/");
  return { ok: true, created };
}
