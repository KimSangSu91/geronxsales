"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { validateAccount, type AccountInput } from "@/lib/account-input";
import { requireUser } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  normalizeBizNo,
  normalizePhone,
  validateContact,
  validateCustomerFields,
  type ContactInput,
  type FieldErrors,
} from "@/lib/customer-input";
import { formatDate, fromDbDate, todayKst, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { ACCOUNT_STATUS_LABEL, ACCOUNT_TYPE_LABEL, CONTACT_ROLE_LABEL } from "@/lib/labels";
import { ConflictError, saveWithVersion } from "@/lib/optimistic";
import { prisma } from "@/lib/prisma";
import {
  customerValues,
  displayValue,
  pickSection,
  SECTION_KEYS,
  SECTIONS,
  type SectionKey,
  type Values,
} from "./sections";

export type Conflict<T> = { editorName: string; editedAt: string; latest: T; version: number };

export type ActionResult<T = Values> =
  | { ok: true }
  | { ok: false; errors?: FieldErrors; message?: string; conflict?: Conflict<T> };

const CHECK = "입력 내용을 확인하세요.";
const text = (v: string) => v.trim() || null;
const int = (v: string) => (v.trim() ? Number(v) : null);
const yesNo = (v: string) => (v === "" ? null : v === "yes");
const short = (v: string) => (v.length > 30 ? `${v.slice(0, 30)}…` : v);

// 충돌 모달용: 마지막으로 기록을 남긴 사람·시각 (모든 변경은 히스토리에 기록되므로 최신 히스토리 기준)
async function lastEditor(customerId: string) {
  const h = await prisma.history.findFirst({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, actor: { select: { name: true } } },
  });
  return { editorName: h?.actor?.name ?? "시스템", editedAt: (h?.createdAt ?? new Date()).toISOString() };
}

function done(customerId: string): ActionResult<never> {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

// ───────── 단일 섹션 (기본·사업자·정산·설치 환경·서비스 운영) ─────────

export async function updateCustomerSection(
  customerId: string,
  section: SectionKey,
  version: number,
  input: Values,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!SECTION_KEYS.includes(section)) return { ok: false, message: "잘못된 요청입니다." };

  const current = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!current) return { ok: false, message: "고객사를 찾을 수 없습니다." };

  const before = customerValues(current);
  const values = pickSection(section, input);
  // 고객사 코드는 한 번 입력하면 변경 불가
  if (section === "basic" && before.code) values.code = before.code;
  // 숨겨진 조건부 항목은 비움 (기타 직접입력·소개처)
  for (const f of SECTIONS[section].fields) if (f.showIf && !f.showIf(values)) values[f.key] = "";

  const { wifiPassword, ...checkable } = values;
  const errors = validateCustomerFields(checkable);

  const users = await prisma.user.findMany({ select: { id: true, name: true, isActive: true } });
  if (section === "basic" && values.ownerId !== before.ownerId) {
    if (!users.find((u) => u.id === values.ownerId)?.isActive) errors.ownerId = "활성 사용자를 선택하세요.";
  }
  if (section === "basic" && values.code && values.code !== before.code) {
    const taken = await prisma.customer.findUnique({ where: { code: values.code }, select: { id: true } });
    if (taken) errors.code = "이미 사용 중인 코드입니다.";
  }
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  // 변경 내역 (히스토리)
  const changes: { field: string; label: string; before: string; after: string }[] = [];
  for (const f of SECTIONS[section].fields) {
    if (f.kind === "secret") continue;
    const b = displayValue(f, f.showIf && !f.showIf(before) ? "" : before[f.key], users);
    const a = displayValue(f, values[f.key], users);
    if (b !== a) changes.push({ field: f.key, label: f.label, before: short(b), after: short(a) });
  }
  const clearWifi = section === "install" && input.wifiPasswordClear === "yes";
  if (section === "install" && (wifiPassword || clearWifi)) {
    changes.push({
      field: "wifiPassword",
      label: "와이파이 비밀번호",
      before: current.wifiPasswordEnc ? "설정됨" : "-",
      after: wifiPassword ? "변경됨" : "삭제",
    });
  }
  if (!changes.length) return { ok: true };

  const data: Prisma.CustomerUpdateManyMutationInput = {};
  const v = values;
  switch (section) {
    case "basic":
      Object.assign(data, {
        name: v.name.trim(),
        code: text(v.code),
        facilityType: v.facilityType,
        facilityTypeOther: text(v.facilityTypeOther),
        region: v.region.trim(),
        address: text(v.address),
        capacity: int(v.capacity),
        ownerId: v.ownerId,
        inboundChannel: v.inboundChannel || null,
        referrer: text(v.referrer),
        memo: text(v.memo),
      });
      break;
    case "biz":
      Object.assign(data, {
        bizName: text(v.bizName),
        bizNo: v.bizNo.trim() ? normalizeBizNo(v.bizNo) : null,
        bizCeo: text(v.bizCeo),
      });
      break;
    case "billing":
      Object.assign(data, {
        billingDay: int(v.billingDay),
        paymentMethod: v.paymentMethod || null,
        taxInvoice: yesNo(v.taxInvoice),
        taxInvoiceEmail: text(v.taxInvoiceEmail),
        cmsMemberNo: text(v.cmsMemberNo),
        cmsEnabled: v.cmsEnabled === "yes",
      });
      break;
    case "install":
      Object.assign(data, {
        floors: int(v.floors),
        rooms: int(v.rooms),
        wifiSsid: text(v.wifiSsid),
        networkMemo: text(v.networkMemo),
        ...(wifiPassword ? { wifiPasswordEnc: encrypt(wifiPassword) } : clearWifi ? { wifiPasswordEnc: null } : {}),
      });
      break;
    case "service":
      Object.assign(data, { serviceUrl: text(v.serviceUrl) });
      break;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() =>
        tx.customer.updateMany({
          where: { id: customerId, version },
          data: { ...data, version: { increment: 1 } },
        }),
      );
      await recordHistory(tx, {
        customerId,
        event: "customer_updated",
        content: `${SECTIONS[section].title} 정보 수정: ${changes.map((c) => `${c.label} ${c.before} → ${c.after}`).join(", ")}`,
        data: { section, changes },
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) {
      const latest = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
      return {
        ok: false,
        conflict: {
          ...(await lastEditor(customerId)),
          latest: pickSection(section, customerValues(latest)),
          version: latest.version,
        },
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, errors: { code: "이미 사용 중인 코드입니다." }, message: CHECK };
    }
    throw e;
  }
  return done(customerId);
}

// 와이파이 비밀번호 [보기]·[복사] — 조회할 때마다 히스토리 기록
export async function revealWifiPassword(customerId: string): Promise<{ ok: boolean; value?: string }> {
  const user = await requireUser();
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { wifiPasswordEnc: true } });
  if (!c?.wifiPasswordEnc) return { ok: false };
  const value = decrypt(c.wifiPasswordEnc);
  await prisma.$transaction((tx) =>
    recordHistory(tx, {
      customerId,
      event: "secret_viewed",
      content: `와이파이 비밀번호 조회 (${user.name})`,
      actorId: user.id,
    }),
  );
  return { ok: true, value };
}

// ───────── 시설 담당자 ─────────

// 대표 담당자 = 실무·주 소통 담당자 표시 (시설 대표자와 무관, 여러 명 지정 가능)
export type ContactPayload = ContactInput;

function contactData(p: ContactPayload) {
  return {
    name: p.name.trim(),
    phone: p.phone.trim() ? normalizePhone(p.phone) : null,
    role: p.role || null,
    title: text(p.title),
    email: text(p.email),
    memo: text(p.memo),
    isPrimary: !!p.isPrimary,
  };
}

function contactPayload(c: {
  name: string;
  phone: string | null;
  role: string | null;
  title: string | null;
  email: string | null;
  memo: string | null;
  isPrimary: boolean;
}): ContactPayload {
  return {
    name: c.name,
    phone: c.phone ?? "",
    role: (c.role ?? "") as ContactPayload["role"],
    title: c.title ?? "",
    email: c.email ?? "",
    memo: c.memo ?? "",
    isPrimary: c.isPrimary,
  };
}

const CONTACT_LABELS: Record<keyof ContactPayload, string> = {
  name: "이름",
  phone: "연락처",
  role: "역할",
  title: "직책",
  email: "이메일",
  memo: "메모",
  isPrimary: "대표 담당자",
};

function contactDisplay(k: keyof ContactPayload, v: string | boolean) {
  if (k === "isPrimary") return v ? "지정" : "해제";
  if (!v) return "-";
  return k === "role" ? (CONTACT_ROLE_LABEL[v as keyof typeof CONTACT_ROLE_LABEL] ?? String(v)) : short(String(v));
}

export async function addContact(customerId: string, payload: ContactPayload): Promise<ActionResult<ContactPayload>> {
  const user = await requireUser();
  const errors = validateContact(payload, true);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  await prisma.$transaction(async (tx) => {
    const c = await tx.facilityContact.create({ data: { customerId, ...contactData(payload) } });
    await recordHistory(tx, {
      customerId,
      event: "contact_added",
      content: `시설 담당자 추가: ${c.name}${c.phone ? ` (${c.phone})` : ""}${c.isPrimary ? " · 대표 담당자" : ""}`,
      actorId: user.id,
    });
  });
  return done(customerId);
}

export async function updateContact(
  contactId: string,
  version: number,
  payload: ContactPayload,
): Promise<ActionResult<ContactPayload>> {
  const user = await requireUser();
  const current = await prisma.facilityContact.findUnique({ where: { id: contactId } });
  if (!current) return { ok: false, message: "담당자를 찾을 수 없습니다. 새로고침하세요." };

  const errors = validateContact(payload, true);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  const before = contactPayload(current);
  const after = contactPayload(contactData(payload));
  const changes = (Object.keys(CONTACT_LABELS) as (keyof ContactPayload)[])
    .filter((k) => before[k] !== after[k])
    .map((k) => `${CONTACT_LABELS[k]} ${contactDisplay(k, before[k])} → ${contactDisplay(k, after[k])}`);
  if (!changes.length) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() =>
        tx.facilityContact.updateMany({
          where: { id: contactId, version },
          data: { ...contactData(payload), version: { increment: 1 } },
        }),
      );
      await recordHistory(tx, {
        customerId: current.customerId,
        event: "contact_updated",
        content: `시설 담당자 수정(${current.name}): ${changes.join(", ")}`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) {
      const latest = await prisma.facilityContact.findUnique({ where: { id: contactId } });
      if (!latest) return { ok: false, message: "다른 사용자가 이 담당자를 삭제했습니다. 새로고침하세요." };
      return {
        ok: false,
        conflict: { ...(await lastEditor(current.customerId)), latest: contactPayload(latest), version: latest.version },
      };
    }
    throw e;
  }
  return done(current.customerId);
}

export async function deleteContact(contactId: string): Promise<ActionResult<never>> {
  const user = await requireUser();
  const c = await prisma.facilityContact.findUnique({ where: { id: contactId } });
  if (!c) return { ok: false, message: "이미 삭제된 담당자입니다. 새로고침하세요." };
  // 등록 필수 항목(시설 담당자 1명)을 유지하기 위해 마지막 1명은 삭제 불가
  const count = await prisma.facilityContact.count({ where: { customerId: c.customerId } });
  if (count <= 1) return { ok: false, message: "시설 담당자는 1명 이상 있어야 합니다. 다른 담당자를 먼저 추가하세요." };

  await prisma.$transaction(async (tx) => {
    await tx.facilityContact.delete({ where: { id: contactId } });
    await recordHistory(tx, {
      customerId: c.customerId,
      event: "contact_deleted",
      content: `시설 담당자 삭제: ${c.name}`,
      actorId: user.id,
    });
  });
  return done(c.customerId);
}

// ★ 클릭: 대표 담당자 지정·해제 (여러 명 가능)
export async function togglePrimaryContact(contactId: string, isPrimary: boolean): Promise<ActionResult<never>> {
  const user = await requireUser();
  const c = await prisma.facilityContact.findUnique({ where: { id: contactId } });
  if (!c) return { ok: false, message: "담당자를 찾을 수 없습니다. 새로고침하세요." };
  if (c.isPrimary === isPrimary) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.facilityContact.update({
      where: { id: contactId },
      data: { isPrimary, version: { increment: 1 } },
    });
    await recordHistory(tx, {
      customerId: c.customerId,
      event: "contact_primary_changed",
      content: `대표 담당자 ${isPrimary ? "지정" : "해제"}: ${c.name}`,
      actorId: user.id,
    });
  });
  return done(c.customerId);
}

// ───────── 서비스 계정 ─────────

function accountPayload(a: {
  loginId: string;
  type: string;
  typeOther: string | null;
  userName: string | null;
  issuedOn: Date | null;
  status: string;
  deactivatedOn: Date | null;
  memo: string | null;
}): AccountInput {
  return {
    loginId: a.loginId,
    type: a.type as AccountInput["type"],
    typeOther: a.typeOther ?? "",
    userName: a.userName ?? "",
    issuedOn: a.issuedOn ? fromDbDate(a.issuedOn) : "",
    status: a.status as AccountInput["status"],
    deactivatedOn: a.deactivatedOn ? fromDbDate(a.deactivatedOn) : "",
    password: "",
    passwordClear: false,
    memo: a.memo ?? "",
  };
}

function accountData(a: AccountInput) {
  const inactive = a.status === "INACTIVE";
  return {
    loginId: a.loginId.trim(),
    type: a.type as Exclude<AccountInput["type"], "">,
    typeOther: a.type === "OTHER" ? text(a.typeOther) : null,
    userName: text(a.userName),
    issuedOn: a.issuedOn ? toDbDate(a.issuedOn) : null,
    status: a.status,
    // 비활성 시 비활성일 기록 (입력 없으면 오늘)
    deactivatedOn: inactive ? toDbDate(a.deactivatedOn || todayKst()) : null,
    memo: text(a.memo),
  };
}

const ACCOUNT_LABELS: Partial<Record<keyof AccountInput, string>> = {
  loginId: "계정 ID",
  type: "유형",
  typeOther: "유형(직접입력)",
  userName: "사용자",
  issuedOn: "발급일",
  status: "상태",
  deactivatedOn: "비활성일",
  memo: "메모",
};

function accountDisplay(k: keyof AccountInput, v: string) {
  if (!v) return "-";
  if (k === "type") return ACCOUNT_TYPE_LABEL[v as keyof typeof ACCOUNT_TYPE_LABEL] ?? v;
  if (k === "status") return ACCOUNT_STATUS_LABEL[v as keyof typeof ACCOUNT_STATUS_LABEL] ?? v;
  if (k === "issuedOn" || k === "deactivatedOn") return formatDate(v);
  return short(v);
}

const loginIdTaken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function addAccount(customerId: string, input: AccountInput): Promise<ActionResult<AccountInput>> {
  const user = await requireUser();
  const errors = validateAccount(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  try {
    await prisma.$transaction(async (tx) => {
      const hasPrimary = await tx.serviceAccount.count({ where: { customerId, isPrimary: true } });
      const a = await tx.serviceAccount.create({
        data: {
          customerId,
          ...accountData(input),
          passwordEnc: input.password ? encrypt(input.password) : null,
          isPrimary: hasPrimary === 0,
        },
      });
      await recordHistory(tx, {
        customerId,
        event: "account_added",
        content: `서비스 계정 추가: ${a.loginId} (${ACCOUNT_TYPE_LABEL[a.type]})`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (loginIdTaken(e)) return { ok: false, errors: { loginId: "이미 등록된 계정 ID입니다." }, message: CHECK };
    throw e;
  }
  return done(customerId);
}

export async function updateAccount(
  accountId: string,
  version: number,
  input: AccountInput,
): Promise<ActionResult<AccountInput>> {
  const user = await requireUser();
  const current = await prisma.serviceAccount.findUnique({ where: { id: accountId } });
  if (!current) return { ok: false, message: "계정을 찾을 수 없습니다. 새로고침하세요." };

  const errors = validateAccount(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  const data = accountData(input);
  const before = accountPayload(current);
  const after = accountPayload(data);
  const changes = (Object.keys(ACCOUNT_LABELS) as (keyof AccountInput)[])
    .filter((k) => before[k] !== after[k])
    .map((k) => `${ACCOUNT_LABELS[k]} ${accountDisplay(k, String(before[k]))} → ${accountDisplay(k, String(after[k]))}`);
  if (input.password) changes.push("비밀번호 변경");
  else if (input.passwordClear && current.passwordEnc) changes.push("비밀번호 삭제");
  if (!changes.length) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() =>
        tx.serviceAccount.updateMany({
          where: { id: accountId, version },
          data: {
            ...data,
            ...(input.password ? { passwordEnc: encrypt(input.password) } : input.passwordClear ? { passwordEnc: null } : {}),
            version: { increment: 1 },
          },
        }),
      );
      await recordHistory(tx, {
        customerId: current.customerId,
        event: "account_updated",
        content: `서비스 계정 수정(${current.loginId}): ${changes.join(", ")}`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) {
      const latest = await prisma.serviceAccount.findUnique({ where: { id: accountId } });
      if (!latest) return { ok: false, message: "다른 사용자가 이 계정을 삭제했습니다. 새로고침하세요." };
      return {
        ok: false,
        conflict: { ...(await lastEditor(current.customerId)), latest: accountPayload(latest), version: latest.version },
      };
    }
    if (loginIdTaken(e)) return { ok: false, errors: { loginId: "이미 등록된 계정 ID입니다." }, message: CHECK };
    throw e;
  }
  return done(current.customerId);
}

export async function deleteAccount(accountId: string): Promise<ActionResult<never>> {
  const user = await requireUser();
  const a = await prisma.serviceAccount.findUnique({ where: { id: accountId } });
  if (!a) return { ok: false, message: "이미 삭제된 계정입니다. 새로고침하세요." };
  const others = await prisma.serviceAccount.count({ where: { customerId: a.customerId, id: { not: a.id } } });
  if (a.isPrimary && others > 0) {
    return { ok: false, message: "대표 계정은 삭제할 수 없습니다. 다른 대표 계정을 먼저 지정하세요." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceAccount.delete({ where: { id: accountId } });
    await recordHistory(tx, {
      customerId: a.customerId,
      event: "account_deleted",
      content: `서비스 계정 삭제: ${a.loginId}`,
      actorId: user.id,
    });
  });
  return done(a.customerId);
}

export async function setPrimaryAccount(accountId: string): Promise<ActionResult<never>> {
  const user = await requireUser();
  const a = await prisma.serviceAccount.findUnique({ where: { id: accountId } });
  if (!a) return { ok: false, message: "계정을 찾을 수 없습니다. 새로고침하세요." };
  if (a.isPrimary) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.serviceAccount.updateMany({
      where: { customerId: a.customerId, isPrimary: true },
      data: { isPrimary: false, version: { increment: 1 } },
    });
    await tx.serviceAccount.update({ where: { id: accountId }, data: { isPrimary: true, version: { increment: 1 } } });
    await recordHistory(tx, {
      customerId: a.customerId,
      event: "account_primary_changed",
      content: `대표 관리자 계정 변경: ${a.loginId}`,
      actorId: user.id,
    });
  });
  return done(a.customerId);
}

// 서비스 계정 비밀번호 [보기]·[복사] — 조회할 때마다 히스토리 기록
export async function revealAccountPassword(accountId: string): Promise<{ ok: boolean; value?: string }> {
  const user = await requireUser();
  const a = await prisma.serviceAccount.findUnique({
    where: { id: accountId },
    select: { customerId: true, loginId: true, passwordEnc: true },
  });
  if (!a?.passwordEnc) return { ok: false };
  const value = decrypt(a.passwordEnc);
  await prisma.$transaction((tx) =>
    recordHistory(tx, {
      customerId: a.customerId,
      event: "secret_viewed",
      content: `서비스 계정 비밀번호 조회: ${a.loginId} (${user.name})`,
      actorId: user.id,
    }),
  );
  return { ok: true, value };
}
