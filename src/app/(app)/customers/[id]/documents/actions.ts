"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { ALLOWED_TYPES, DOCUMENT_BUCKET, fileProblem, SLOT_CONFIG, TAB_SLOTS, titleProblem, type TabSlot } from "@/lib/document-rules";
import { recordHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

type Fail = { ok: false; message: string };
const LINK_SECONDS = 120; // 열람·다운로드 링크 유효 시간

function done(customerId: string) {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

// 추가 자료는 직접 입력한 서류명
const slotLabel = (slot: string, title?: string | null) => (slot === "ETC" && title ? title : (SLOT_CONFIG[slot as TabSlot]?.label ?? slot));

// ① 업로드 준비: 검사 후 Storage 직접 업로드용 1회성 토큰 발급 (파일 본문은 서버를 거치지 않음)
export async function prepareUpload(
  customerId: string,
  slot: TabSlot,
  file: { name: string; size: number; type: string },
  replaceId?: string,
  title?: string, // 추가 자료 새로 만들 때 서류명
): Promise<{ ok: true; path: string; token: string } | Fail> {
  await requireUser();
  if (!TAB_SLOTS.includes(slot)) return { ok: false, message: "잘못된 서류 구분입니다." };
  if (slot === "ETC" && !replaceId) {
    const tp = titleProblem(title ?? "");
    if (tp) return { ok: false, message: tp };
  }
  const problem = fileProblem(file);
  if (problem) return { ok: false, message: problem };

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) return { ok: false, message: "고객사를 찾을 수 없습니다." };

  if (slot === "CONTRACT") {
    const current = await prisma.contract.findFirst({ where: { customerId, state: "CURRENT" }, select: { id: true } });
    if (!current) return { ok: false, message: "계약서는 계약을 먼저 등록한 뒤 올릴 수 있습니다." };
  }
  if (replaceId) {
    const old = await prisma.document.findUnique({ where: { id: replaceId }, select: { customerId: true, slot: true } });
    if (!old || old.customerId !== customerId || old.slot !== slot) return { ok: false, message: "교체할 파일을 찾을 수 없습니다. 새로고침하세요." };
  } else if (slot !== "ETC") {
    // 항목당 파일 1개 — 이미 있으면 교체로
    const exists = await existingSingle(customerId, slot);
    if (exists) return { ok: false, message: "이미 등록된 서류가 있습니다. [교체]를 사용하세요." };
  }

  // 저장소 파일명은 영문 고유값 (원래 파일명은 DB에 보관, 다운로드 시 원래 이름으로)
  const path = `customers/${customerId}/${slot}/${randomUUID()}.${ALLOWED_TYPES[file.type]}`;
  const { data, error } = await createAdminClient().storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "업로드를 준비하지 못했습니다. 다시 시도하세요." };
  return { ok: true, path: data.path, token: data.token };
}

// 단일 슬롯의 현재 파일 (계약서는 현재 계약 기준)
async function existingSingle(customerId: string, slot: TabSlot) {
  if (slot === "CONTRACT") {
    const current = await prisma.contract.findFirst({ where: { customerId, state: "CURRENT" }, select: { id: true } });
    return current ? prisma.document.findFirst({ where: { customerId, slot, contractId: current.id } }) : null;
  }
  return prisma.document.findFirst({ where: { customerId, slot } });
}

// ② 업로드 완료: Storage에 실제로 올라갔는지 확인 후 파일 정보 저장 (교체면 기존 파일 삭제)
export async function completeUpload(
  customerId: string,
  input: { slot: TabSlot; path: string; fileName: string; title?: string; replaceId?: string },
): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  const storage = createAdminClient().storage.from(DOCUMENT_BUCKET);
  const discard = () => storage.remove([input.path]);

  if (!TAB_SLOTS.includes(input.slot) || !input.path.startsWith(`customers/${customerId}/${input.slot}/`)) {
    return { ok: false, message: "잘못된 요청입니다." };
  }
  const { data: info, error } = await storage.info(input.path);
  if (error || !info) return { ok: false, message: "업로드된 파일을 찾을 수 없습니다. 다시 올려 주세요." };
  const mimeType = info.contentType ?? "";
  const size = info.size ?? 0;
  const problem = fileProblem({ name: input.fileName, size, type: mimeType });
  if (problem) {
    await discard();
    return { ok: false, message: problem };
  }

  const old = input.replaceId ? await prisma.document.findUnique({ where: { id: input.replaceId } }) : null;
  // 추가 자료: 새로 만들 때 서류명 필수 (교체 시에는 기존 서류명 유지)
  const title = input.slot === "ETC" ? (old?.title ?? input.title?.trim() ?? "") : null;
  if (input.slot === "ETC" && titleProblem(title ?? "")) {
    await discard();
    return { ok: false, message: titleProblem(title ?? "")! };
  }
  if (input.replaceId && (!old || old.customerId !== customerId || old.slot !== input.slot)) {
    await discard();
    return { ok: false, message: "교체할 파일을 찾을 수 없습니다. 새로고침하세요." };
  }
  const contract =
    input.slot === "CONTRACT"
      ? await prisma.contract.findFirst({ where: { customerId, state: "CURRENT" }, select: { id: true } })
      : null;
  if (input.slot === "CONTRACT" && !contract) {
    await discard();
    return { ok: false, message: "현재 계약이 없습니다. 새로고침하세요." };
  }
  // 단일 서류에 그 사이 다른 사람이 먼저 올린 경우
  if (!old && input.slot !== "ETC" && (await existingSingle(customerId, input.slot))) {
    await discard();
    return { ok: false, message: "그 사이 다른 사용자가 같은 서류를 올렸습니다. 새로고침 후 [교체]를 사용하세요." };
  }

  const label = slotLabel(input.slot, title);
  try {
    await prisma.$transaction(async (tx) => {
      if (old) await tx.document.delete({ where: { id: old.id } });
      await tx.document.create({
        data: {
          customerId,
          slot: input.slot,
          title,
          contractId: contract?.id ?? null,
          groupId: randomUUID(),
          fileName: input.fileName.slice(0, 200),
          storagePath: input.path,
          mimeType,
          size,
          uploadedById: user.id,
        },
      });
      await recordHistory(tx, {
        customerId,
        event: old ? "file_replaced" : "file_uploaded",
        content: old ? `파일 교체: ${label} (${old.fileName} → ${input.fileName})` : `파일 업로드: ${label} (${input.fileName})`,
        actorId: user.id,
      });
    });
  } catch (e) {
    await discard();
    throw e;
  }
  // 교체된 기존 파일은 보관하지 않고 삭제
  if (old) await storage.remove([old.storagePath]);
  done(customerId);
  return { ok: true };
}

// 열람·다운로드: 짧은 시간만 유효한 링크 발급 (입소자 명단은 개인정보 → 열람·다운로드 기록)
export async function getFileUrl(documentId: string, mode: "view" | "download"): Promise<{ ok: true; url: string } | Fail> {
  const user = await requireUser();
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return { ok: false, message: "파일을 찾을 수 없습니다. 새로고침하세요." };

  const { data, error } = await createAdminClient()
    .storage.from(DOCUMENT_BUCKET)
    .createSignedUrl(doc.storagePath, LINK_SECONDS, mode === "download" ? { download: doc.fileName } : undefined);
  if (error || !data) return { ok: false, message: "링크를 만들지 못했습니다." };

  if (doc.slot === "RESIDENT_LIST") {
    await prisma.$transaction((tx) =>
      recordHistory(tx, {
        customerId: doc.customerId,
        event: "resident_list_accessed",
        content: `입소자 명단 ${mode === "download" ? "다운로드" : "열람"} (${user.name}): ${doc.fileName}`,
        actorId: user.id,
      }),
    );
  }
  return { ok: true, url: data.signedUrl };
}

export async function deleteDocument(documentId: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return { ok: false, message: "이미 삭제된 파일입니다. 새로고침하세요." };

  await prisma.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: documentId } });
    await recordHistory(tx, {
      customerId: doc.customerId,
      event: "file_deleted",
      content: `파일 삭제: ${slotLabel(doc.slot, doc.title)} (${doc.fileName})`,
      actorId: user.id,
    });
  });
  await createAdminClient().storage.from(DOCUMENT_BUCKET).remove([doc.storagePath]);
  done(doc.customerId);
  return { ok: true };
}
