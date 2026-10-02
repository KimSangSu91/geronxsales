"use server";

import { revalidatePath } from "next/cache";
import type { InboundChannel } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-input";
import { isDateString, kstStartOfDay, todayKst } from "@/lib/date";
import { INBOUND_CHANNEL_LABEL } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export type InquiryInput = {
  channel: InboundChannel;
  receivedOn: string;
  facilityName: string;
  contactName: string;
  phone: string;
  email: string;
  region: string;
  scale: string;
  content: string;
};
type Result = { ok: true } | { ok: false; message: string; errors?: Record<string, string> };

const text = (v: string, max = 2000) => v.trim().slice(0, max) || null;

function validate(input: InquiryInput) {
  const errors: Record<string, string> = {};
  if (!Object.hasOwn(INBOUND_CHANNEL_LABEL, input.channel)) errors.channel = "채널을 선택하세요.";
  if (!isDateString(input.receivedOn) || input.receivedOn > todayKst()) errors.receivedOn = "접수일을 확인하세요.";
  if (!input.facilityName.trim() && !input.contactName.trim() && !input.phone.trim()) errors.facilityName = "시설명·담당자·연락처 중 하나는 입력하세요.";
  if (input.phone.trim() && !/^[\d\s-]{9,15}$/.test(input.phone.trim())) errors.phone = "연락처 형식을 확인하세요.";
  return errors;
}

function dataOf(input: InquiryInput) {
  // 오늘 접수면 지금 시각, 지난 날짜면 그날 0시(KST)
  const receivedAt = input.receivedOn === todayKst() ? new Date() : kstStartOfDay(input.receivedOn);
  return {
    channel: input.channel,
    receivedAt,
    facilityName: text(input.facilityName, 200),
    contactName: text(input.contactName, 100),
    phone: input.phone.trim() ? normalizePhone(input.phone) : null,
    email: text(input.email, 200),
    region: text(input.region, 100),
    scale: text(input.scale, 100),
    content: text(input.content, 5000),
  };
}

// 문의 직접 등록 (전화·소개 등)
export async function createInquiry(input: InquiryInput): Promise<Result> {
  const me = await requireUser();
  const errors = validate(input);
  if (Object.keys(errors).length) return { ok: false, message: "입력 내용을 확인하세요.", errors };
  await prisma.inquiry.create({ data: { ...dataOf(input), raw: { createdBy: me.name } } });
  revalidatePath("/inbound");
  return { ok: true };
}

// 미처리 문의 수정 (구글폼 문의도 오타 등 수정 가능 — 원본은 raw에 그대로 남음)
export async function updateInquiry(id: string, input: InquiryInput): Promise<Result> {
  await requireUser();
  const errors = validate(input);
  if (Object.keys(errors).length) return { ok: false, message: "입력 내용을 확인하세요.", errors };
  const { count } = await prisma.inquiry.updateMany({ where: { id, status: "NEW" }, data: dataOf(input) });
  if (!count) return { ok: false, message: "이미 처리된 문의입니다." };
  revalidatePath("/inbound");
  return { ok: true };
}

export async function dismissInquiry(id: string, reason: string): Promise<Result> {
  const me = await requireUser();
  const { count } = await prisma.inquiry.updateMany({
    where: { id, status: "NEW" },
    data: { status: "DISMISSED", dismissReason: text(reason, 500), handledById: me.id, handledAt: new Date() },
  });
  if (!count) return { ok: false, message: "이미 처리된 문의입니다." };
  revalidatePath("/inbound");
  return { ok: true };
}

export async function restoreInquiry(id: string): Promise<Result> {
  await requireUser();
  const { count } = await prisma.inquiry.updateMany({
    where: { id, status: "DISMISSED" },
    data: { status: "NEW", dismissReason: null, handledById: null, handledAt: null },
  });
  if (!count) return { ok: false, message: "되돌릴 수 없는 문의입니다." };
  revalidatePath("/inbound");
  return { ok: true };
}

// 중복 의심: 시설명(공백 무시) 또는 연락처가 같은 기존 고객사
export async function findDuplicates(id: string) {
  await requireUser();
  const q = await prisma.inquiry.findUnique({ where: { id } });
  if (!q) return [];
  const name = q.facilityName?.replace(/\s/g, "");
  const phone = q.phone ? normalizePhone(q.phone) : null;
  const or = [];
  if (phone) or.push({ contacts: { some: { phone } } });
  const candidates = await prisma.customer.findMany({
    where: name ? { OR: [...or, { name: { contains: name.slice(0, 2) } }] } : or.length ? { OR: or } : { id: "-" },
    select: { id: true, no: true, name: true, status: true, region: true, contacts: { select: { name: true, phone: true } } },
    take: 50,
  });
  return candidates
    .filter((c) => (name && c.name.replace(/\s/g, "") === name) || (phone && c.contacts.some((x) => x.phone === phone)))
    .map((c) => ({ id: c.id, no: c.no, name: c.name, status: c.status, region: c.region, contacts: c.contacts.map((x) => `${x.name} ${x.phone ?? ""}`.trim()) }));
}
