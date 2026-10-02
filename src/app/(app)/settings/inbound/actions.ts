"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { inquiryData, mappingOf, parseAnswers } from "@/lib/inbound";
import { INQUIRY_FIELDS, type MappingTarget } from "@/lib/inbound-fields";
import { ConflictError, saveWithVersion } from "@/lib/optimistic";
import { prisma } from "@/lib/prisma";

type Fail = { ok: false; message: string };
const newToken = () => randomBytes(18).toString("base64url");

async function checkOwner(id: string | null) {
  if (!id) return true;
  const u = await prisma.user.findUnique({ where: { id } });
  return !!u?.isActive;
}

export async function createSource(name: string, defaultOwnerId: string | null): Promise<{ ok: true; id: string } | Fail> {
  await requireAdmin();
  const n = name.trim();
  if (!n) return { ok: false, message: "경로 이름을 입력하세요." };
  if (!(await checkOwner(defaultOwnerId))) return { ok: false, message: "기본 담당자를 다시 선택하세요." };
  const s = await prisma.inboundSource.create({ data: { name: n.slice(0, 100), token: newToken(), defaultOwnerId } });
  revalidatePath("/settings/inbound");
  return { ok: true, id: s.id };
}

export async function updateSource(
  id: string,
  version: number,
  input: { name: string; isActive: boolean; defaultOwnerId: string | null; mapping: Record<string, MappingTarget> },
): Promise<{ ok: true; reapplied: number } | Fail> {
  await requireAdmin();
  const n = input.name.trim();
  if (!n) return { ok: false, message: "경로 이름을 입력하세요." };
  if (!(await checkOwner(input.defaultOwnerId))) return { ok: false, message: "기본 담당자를 다시 선택하세요." };
  const mapping: Record<string, MappingTarget> = {};
  for (const [q, t] of Object.entries(input.mapping)) {
    if (t === "none" || Object.hasOwn(INQUIRY_FIELDS, t)) mapping[q.slice(0, 300)] = t;
  }
  try {
    const reapplied = await prisma.$transaction(async (tx) => {
      await saveWithVersion(() =>
        tx.inboundSource.updateMany({
          where: { id, version },
          data: { name: n.slice(0, 100), isActive: input.isActive, defaultOwnerId: input.defaultOwnerId, mapping, version: { increment: 1 } },
        }),
      );
      // 바뀐 연결 규칙을 아직 처리하지 않은 문의에 다시 적용 (원본 답변 기준)
      const open = await tx.inquiry.findMany({ where: { sourceId: id, status: "NEW" }, select: { id: true, raw: true } });
      for (const q of open) {
        const raw = (q.raw ?? {}) as { answers?: unknown; respondentEmail?: string };
        await tx.inquiry.update({ where: { id: q.id }, data: inquiryData(parseAnswers(raw.answers), mappingOf(mapping), raw.respondentEmail ?? "") });
      }
      return open.length;
    });
    revalidatePath("/settings/inbound");
    revalidatePath("/inbound");
    return { ok: true, reapplied };
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, message: "다른 사용자가 먼저 수정했습니다. 새로 불러온 뒤 다시 저장하세요." };
    throw e;
  }
}

// 연결 코드 재발급 — 기존 코드를 넣은 구글폼은 더 이상 수신되지 않음
export async function regenerateToken(id: string): Promise<{ ok: true } | Fail> {
  await requireAdmin();
  await prisma.inboundSource.update({ where: { id }, data: { token: newToken(), version: { increment: 1 } } });
  revalidatePath(`/settings/inbound/${id}`);
  return { ok: true };
}
