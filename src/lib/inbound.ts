import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { normalizePhone } from "@/lib/customer-input";
import { applyMapping, type FormAnswer, type MappingTarget } from "@/lib/inbound-fields";
import { prisma } from "@/lib/prisma";

export type FormPayload = {
  token?: unknown;
  responseId?: unknown;
  submittedAt?: unknown;
  formTitle?: unknown;
  respondentEmail?: unknown;
  answers?: unknown;
};

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");

export function parseAnswers(raw: unknown): FormAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 100)
    .map((a) => ({ question: str((a as FormAnswer)?.question, 300).trim(), answer: str((a as FormAnswer)?.answer, 5000) }))
    .filter((a) => a.question);
}

export const mappingOf = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, MappingTarget>) : {});

// 정리된 항목 → Inquiry 칸 (연락처 형식 통일, 길이 제한)
export function inquiryData(answers: FormAnswer[], mapping: Record<string, MappingTarget>, respondentEmail = "") {
  const f = applyMapping(answers, mapping);
  const phone = f.phone ? (/^[\d\s-]{9,15}$/.test(f.phone) ? normalizePhone(f.phone) : f.phone) : null;
  return {
    facilityName: f.facilityName?.slice(0, 200) ?? null,
    contactName: f.contactName?.slice(0, 100) ?? null,
    phone: phone?.slice(0, 50) ?? null,
    email: (f.email ?? respondentEmail)?.slice(0, 200) || null,
    region: f.region?.slice(0, 100) ?? null,
    scale: f.scale?.slice(0, 100) ?? null,
    content: f.content ?? null,
  };
}

// 구글폼 응답 수신 (Route Handler에서 호출) — 같은 응답은 한 번만 저장
export async function receiveFormResponse(p: FormPayload): Promise<{ status: number; body: object }> {
  const token = str(p.token, 200);
  const responseId = str(p.responseId, 200);
  if (!token || !responseId) return { status: 400, body: { ok: false, error: "token·responseId 필요" } };
  const source = await prisma.inboundSource.findUnique({ where: { token } });
  if (!source) return { status: 401, body: { ok: false, error: "연결 코드가 올바르지 않습니다" } };
  if (!source.isActive) return { status: 403, body: { ok: false, error: "수신이 중지된 경로입니다" } };

  const answers = parseAnswers(p.answers);
  const submitted = new Date(str(p.submittedAt, 50));
  const receivedAt = isNaN(submitted.getTime()) ? new Date() : submitted;
  const externalId = `${source.id}:${responseId}`;
  const questions = [...new Set([...(source.questions as string[]), ...answers.map((a) => a.question)])];

  try {
    await prisma.$transaction([
      prisma.inquiry.create({
        data: {
          channel: "GOOGLE_FORM",
          sourceId: source.id,
          externalId,
          receivedAt,
          ...inquiryData(answers, mappingOf(source.mapping), str(p.respondentEmail, 200)),
          raw: { formTitle: str(p.formTitle, 300), respondentEmail: str(p.respondentEmail, 200), answers } as Prisma.InputJsonValue,
        },
      }),
      prisma.inboundSource.update({ where: { id: source.id }, data: { questions, lastReceivedAt: new Date() } }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: 200, body: { ok: true, duplicate: true } };
    throw e;
  }
  return { status: 200, body: { ok: true } };
}
