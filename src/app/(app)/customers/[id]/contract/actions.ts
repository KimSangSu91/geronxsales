"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  contractDataOf,
  parseAmount,
  validateCharge,
  validateContract,
  validateExtraDevice,
  validateOption,
  type ChargeInput,
  type ContractInput,
  type ExtraDeviceInput,
  type OptionInput,
} from "@/lib/contract-input";
import type { FieldErrors } from "@/lib/customer-input";
import { formatDate, fromDbDate, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import {
  CHARGE_TYPE_LABEL,
  CONTRACT_TYPE_LABEL,
  DEVICE_KIND_LABEL,
  EXTRA_REASON_LABEL,
  OPTION_CATEGORY_LABEL,
  PURCHASE_PAYMENT_LABEL,
} from "@/lib/labels";
import { contractLines, contractPricingOf } from "@/lib/billing";
import { lastEditor } from "@/lib/last-editor";
import { formatWon } from "@/lib/money";
import { ConflictError, saveWithVersion } from "@/lib/optimistic";
import { prisma } from "@/lib/prisma";
import { chargeInputOf, contractInputOf, extraInputOf, optionInputOf } from "./contract-shared";

export type Conflict<T> = { editorName: string; editedAt: string; latest: T; version: number };
export type Result<T = never> =
  | { ok: true }
  | { ok: false; errors?: FieldErrors; message?: string; conflict?: Conflict<T> };

const CHECK = "입력 내용을 확인하세요.";
const text = (v: string) => v.trim() || null;
const month = (ym: string) => (ym ? toDbDate(`${ym}-01`) : null);
const monthText = (d: Date) => fromDbDate(d).slice(0, 7).replace("-", ".");
const price = (amount: number, isFree: boolean) => (isFree ? "무상" : `${formatWon(amount)}원`);

function done(customerId: string): Result {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

// 변경 내역 문장: "라벨 전 → 후" 목록
function diff<T extends Record<string, unknown>>(before: T, after: T, labels: Partial<Record<keyof T, string>>, show: (k: keyof T, v: unknown) => string) {
  return (Object.keys(labels) as (keyof T)[])
    .filter((k) => String(before[k]) !== String(after[k]))
    .map((k) => `${labels[k]} ${show(k, before[k])} → ${show(k, after[k])}`);
}

// ───────── 계약 ─────────

const CONTRACT_LABELS: Partial<Record<keyof ContractInput, string>> = {
  contractDate: "계약일",
  startDate: "시작일",
  endDate: "종료일",
  contractUsers: "계약 인원",
  autoRenew: "자동연장",
  autoRenewMonths: "연장 기간(개월)",
  qtyHub: "허브",
  qtyBand: "밴드",
  qtyCharger: "충전기",
  contractType: "유형",
  joinFee: "가입비",
  unitPriceHub: "허브 단가",
  unitPriceBand: "밴드 단가",
  unitPriceCharger: "충전기 단가",
  purchasePayment: "납부",
  purchaseBillingMonth: "청구·분납 시작월",
  installmentMonths: "분납 개월",
  managementFee: "월 관리비",
  managementFeeStart: "관리비 시작월",
  memo: "메모",
};

function contractShow(k: keyof ContractInput, v: unknown): string {
  const s = String(v ?? "");
  if (!s) return "-";
  if (k === "contractDate" || k === "startDate" || k === "endDate") return formatDate(s);
  if (k === "contractType") return CONTRACT_TYPE_LABEL[s as ContractInput["contractType"]];
  if (k === "purchasePayment") return PURCHASE_PAYMENT_LABEL[s as ContractInput["purchasePayment"]];
  if (k === "autoRenew") return s === "yes" ? "Y" : "N";
  if (k === "purchaseBillingMonth" || k === "managementFeeStart") return s.replace("-", ".");
  return s.length > 30 ? `${s.slice(0, 30)}…` : s;
}

// 계약 금액 한 줄 요약 (히스토리)
function pricingText(d: ReturnType<typeof contractDataOf>) {
  const p = contractPricingOf(d);
  const parts = contractLines(p).map((l) => `${l.label} ${formatWon(l.amount)}원${l.type === "MONTHLY" ? "/월" : ""}`);
  return `${CONTRACT_TYPE_LABEL[d.contractType]} · ${parts.join(" · ")}`;
}

export async function createContract(customerId: string, input: ContractInput): Promise<Result> {
  const user = await requireUser();
  const errors = validateContract(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };
  const current = await prisma.contract.findFirst({ where: { customerId, state: "CURRENT" }, select: { id: true } });
  if (current) return { ok: false, message: "현재 계약이 이미 있습니다. 새로고침하세요." };

  const d = contractDataOf(input);
  const qty = [["허브", d.qtyHub], ["밴드", d.qtyBand], ["충전기", d.qtyCharger]]
    .filter(([, q]) => Number(q) > 0)
    .map(([l, q]) => `${l} ${q}`)
    .join(" · ");
  await prisma.$transaction(async (tx) => {
    await tx.contract.create({ data: { customerId, state: "CURRENT", origin: "NEW", ...d } });
    await recordHistory(tx, {
      customerId,
      event: "contract_created",
      content: `계약 등록: ${formatDate(input.startDate)} ~ ${formatDate(input.endDate)} · ${d.contractUsers}명 · 자동연장 ${d.autoRenew ? `Y(${d.autoRenewMonths}개월)` : "N"}${qty ? ` · 장비 ${qty}` : ""} · ${pricingText(d)}`,
      actorId: user.id,
    });
  });
  return done(customerId);
}

export async function updateContract(contractId: string, version: number, input: ContractInput): Promise<Result<ContractInput>> {
  const user = await requireUser();
  const current = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!current) return { ok: false, message: "계약을 찾을 수 없습니다. 새로고침하세요." };
  if (current.state !== "CURRENT") return { ok: false, message: "현재 계약만 수정할 수 있습니다." };
  const errors = validateContract(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  const changes = diff(contractInputOf(current), contractInputOf({ ...current, ...contractDataOf(input) }), CONTRACT_LABELS, contractShow);
  if (!changes.length) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() =>
        tx.contract.updateMany({ where: { id: contractId, version }, data: { ...contractDataOf(input), version: { increment: 1 } } }),
      );
      await recordHistory(tx, {
        customerId: current.customerId,
        event: "contract_updated",
        content: `계약 수정: ${changes.join(", ")}`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) {
      const latest = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
      return { ok: false, conflict: { ...(await lastEditor(current.customerId)), latest: contractInputOf(latest), version: latest.version } };
    }
    throw e;
  }
  return done(current.customerId);
}

// ───────── 비용 항목 (현재 계약에만 추가·수정·삭제) ─────────

function chargeData(c: ChargeInput) {
  return {
    type: c.type,
    name: c.name.trim(),
    amount: c.isFree ? 0 : parseAmount(c.amount),
    isFree: c.isFree,
    freeReason: c.isFree ? text(c.freeReason) : null,
    billingMonth: c.type === "ONE_TIME" ? month(c.billingMonth) : null,
  };
}

const chargeText = (d: ReturnType<typeof chargeData>) =>
  `${d.name} (${CHARGE_TYPE_LABEL[d.type]}) ${price(d.amount, d.isFree)}${d.billingMonth ? ` · 청구 ${monthText(d.billingMonth)}` : ""}`;

async function currentContractOf(contractId: string) {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { customerId: true, state: true } });
  if (!c) return { error: "계약을 찾을 수 없습니다. 새로고침하세요." } as const;
  if (c.state !== "CURRENT") return { error: "현재 계약의 비용만 바꿀 수 있습니다." } as const;
  return { customerId: c.customerId } as const;
}

export async function addCharge(contractId: string, input: ChargeInput): Promise<Result> {
  const user = await requireUser();
  const errors = validateCharge(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };
  const c = await currentContractOf(contractId);
  if ("error" in c) return { ok: false, message: c.error };

  const d = chargeData(input);
  await prisma.$transaction(async (tx) => {
    await tx.contractCharge.create({ data: { contractId, ...d } });
    await recordHistory(tx, { customerId: c.customerId, event: "charge_added", content: `비용 항목 추가: ${chargeText(d)}`, actorId: user.id });
  });
  return done(c.customerId);
}

const CHARGE_LABELS: Partial<Record<keyof ChargeInput, string>> = {
  type: "유형",
  name: "항목명",
  amount: "금액",
  isFree: "무상",
  freeReason: "무상 사유",
  billingMonth: "청구월",
};
const chargeShow = (k: keyof ChargeInput, v: unknown) =>
  k === "type" ? CHARGE_TYPE_LABEL[v as ChargeInput["type"]] : k === "isFree" ? (v ? "Y" : "N") : String(v || "-");

export async function updateCharge(chargeId: string, version: number, input: ChargeInput): Promise<Result<ChargeInput>> {
  const user = await requireUser();
  const current = await prisma.contractCharge.findUnique({ where: { id: chargeId } });
  if (!current) return { ok: false, message: "비용 항목을 찾을 수 없습니다. 새로고침하세요." };
  const c = await currentContractOf(current.contractId);
  if ("error" in c) return { ok: false, message: c.error };
  const errors = validateCharge(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  const d = chargeData(input);
  const changes = diff(chargeInputOf(current), chargeInputOf({ ...current, ...d }), CHARGE_LABELS, chargeShow);
  if (!changes.length) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() =>
        tx.contractCharge.updateMany({ where: { id: chargeId, version }, data: { ...d, version: { increment: 1 } } }),
      );
      await recordHistory(tx, {
        customerId: c.customerId,
        event: "charge_updated",
        content: `비용 항목 수정(${current.name}): ${changes.join(", ")}`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) {
      const latest = await prisma.contractCharge.findUnique({ where: { id: chargeId } });
      if (!latest) return { ok: false, message: "다른 사용자가 이 항목을 삭제했습니다. 새로고침하세요." };
      return { ok: false, conflict: { ...(await lastEditor(c.customerId)), latest: chargeInputOf(latest), version: latest.version } };
    }
    throw e;
  }
  return done(c.customerId);
}

export async function deleteCharge(chargeId: string): Promise<Result> {
  const user = await requireUser();
  const current = await prisma.contractCharge.findUnique({ where: { id: chargeId } });
  if (!current) return { ok: false, message: "이미 삭제된 항목입니다. 새로고침하세요." };
  const c = await currentContractOf(current.contractId);
  if ("error" in c) return { ok: false, message: c.error };

  await prisma.$transaction(async (tx) => {
    await tx.contractCharge.delete({ where: { id: chargeId } });
    await recordHistory(tx, { customerId: c.customerId, event: "charge_deleted", content: `비용 항목 삭제: ${chargeText(current)}`, actorId: user.id });
  });
  return done(c.customerId);
}

// ───────── 옵션상품 ─────────

function optionData(o: OptionInput) {
  return {
    category: o.category as "TABLET" | "TV" | "OTHER",
    categoryOther: o.category === "OTHER" ? text(o.categoryOther) : null,
    productName: o.productName.trim(),
    qty: Number(o.qty),
    providedOn: toDbDate(o.providedOn),
    chargeType: o.chargeType,
    amount: o.isFree ? 0 : parseAmount(o.amount),
    isFree: o.isFree,
    freeReason: o.isFree ? text(o.freeReason) : null,
    billingMonth: o.chargeType === "ONE_TIME" ? month(o.billingMonth) : null,
    memo: text(o.memo),
  };
}

const optionText = (d: ReturnType<typeof optionData>) =>
  `${d.category === "OTHER" ? (d.categoryOther ?? "기타") : OPTION_CATEGORY_LABEL[d.category]} ${d.productName} ${d.qty}개 (${CHARGE_TYPE_LABEL[d.chargeType]}) ${price(d.amount, d.isFree)}`;

const OPTION_LABELS: Partial<Record<keyof OptionInput, string>> = {
  category: "구분",
  categoryOther: "구분(직접입력)",
  productName: "제품명",
  qty: "수량",
  providedOn: "제공일",
  chargeType: "유형",
  amount: "금액",
  isFree: "무상",
  freeReason: "무상 사유",
  billingMonth: "청구월",
  memo: "메모",
};
const optionShow = (k: keyof OptionInput, v: unknown) =>
  k === "category"
    ? OPTION_CATEGORY_LABEL[v as "TABLET"] ?? "-"
    : k === "chargeType"
      ? CHARGE_TYPE_LABEL[v as "ONE_TIME"]
      : k === "isFree"
        ? v ? "Y" : "N"
        : k === "providedOn" && v
          ? formatDate(String(v))
          : String(v || "-");

export async function addOption(customerId: string, input: OptionInput): Promise<Result> {
  const user = await requireUser();
  const errors = validateOption(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };
  const d = optionData(input);
  await prisma.$transaction(async (tx) => {
    await tx.optionProduct.create({ data: { customerId, ...d } });
    await recordHistory(tx, { customerId, event: "option_added", content: `옵션상품 추가: ${optionText(d)}`, actorId: user.id });
  });
  return done(customerId);
}

export async function updateOption(optionId: string, version: number, input: OptionInput): Promise<Result<OptionInput>> {
  const user = await requireUser();
  const current = await prisma.optionProduct.findUnique({ where: { id: optionId } });
  if (!current) return { ok: false, message: "옵션상품을 찾을 수 없습니다. 새로고침하세요." };
  const errors = validateOption(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  const d = optionData(input);
  const changes = diff(optionInputOf(current), optionInputOf({ ...current, ...d }), OPTION_LABELS, optionShow);
  if (!changes.length) return { ok: true };
  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() =>
        tx.optionProduct.updateMany({ where: { id: optionId, version }, data: { ...d, version: { increment: 1 } } }),
      );
      await recordHistory(tx, {
        customerId: current.customerId,
        event: "option_updated",
        content: `옵션상품 수정(${current.productName}): ${changes.join(", ")}`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) {
      const latest = await prisma.optionProduct.findUnique({ where: { id: optionId } });
      if (!latest) return { ok: false, message: "다른 사용자가 이 항목을 삭제했습니다. 새로고침하세요." };
      return { ok: false, conflict: { ...(await lastEditor(current.customerId)), latest: optionInputOf(latest), version: latest.version } };
    }
    throw e;
  }
  return done(current.customerId);
}

export async function deleteOption(optionId: string): Promise<Result> {
  const user = await requireUser();
  const o = await prisma.optionProduct.findUnique({ where: { id: optionId } });
  if (!o) return { ok: false, message: "이미 삭제된 항목입니다. 새로고침하세요." };
  await prisma.$transaction(async (tx) => {
    await tx.optionProduct.delete({ where: { id: optionId } });
    await recordHistory(tx, { customerId: o.customerId, event: "option_deleted", content: `옵션상품 삭제: ${optionText(o)}`, actorId: user.id });
  });
  return done(o.customerId);
}

// ───────── 추가 기기 제공 ─────────

function extraData(x: ExtraDeviceInput) {
  return {
    kind: x.kind as "BAND" | "HUB" | "CHARGER" | "ADAPTER" | "OTHER",
    kindOther: x.kind === "OTHER" ? text(x.kindOther) : null,
    qty: Number(x.qty),
    reason: x.reason as "LOST" | "BROKEN" | "EXPANSION" | "OTHER",
    reasonOther: x.reason === "OTHER" ? text(x.reasonOther) : null,
    providedOn: toDbDate(x.providedOn),
    amount: x.isFree ? 0 : parseAmount(x.amount),
    isFree: x.isFree,
    freeReason: x.isFree ? text(x.freeReason) : null,
    billingMonth: x.isFree ? null : month(x.billingMonth),
    memo: text(x.memo),
  };
}

const extraText = (d: ReturnType<typeof extraData>) =>
  `${d.kind === "OTHER" ? (d.kindOther ?? "기타") : DEVICE_KIND_LABEL[d.kind]} ${d.qty}개 (${d.reason === "OTHER" ? (d.reasonOther ?? "기타") : EXTRA_REASON_LABEL[d.reason]}) ${price(d.amount, d.isFree)}`;

const EXTRA_LABELS: Partial<Record<keyof ExtraDeviceInput, string>> = {
  kind: "기기",
  kindOther: "기기명",
  qty: "수량",
  reason: "사유",
  reasonOther: "사유(직접입력)",
  providedOn: "제공일",
  amount: "금액",
  isFree: "무상",
  freeReason: "무상 사유",
  billingMonth: "청구월",
  memo: "메모",
};
const extraShow = (k: keyof ExtraDeviceInput, v: unknown) =>
  k === "kind"
    ? DEVICE_KIND_LABEL[v as "BAND"] ?? "-"
    : k === "reason"
      ? EXTRA_REASON_LABEL[v as "LOST"] ?? "-"
      : k === "isFree"
        ? v ? "Y" : "N"
        : k === "providedOn" && v
          ? formatDate(String(v))
          : String(v || "-");

export async function addExtraDevice(customerId: string, input: ExtraDeviceInput): Promise<Result> {
  const user = await requireUser();
  const errors = validateExtraDevice(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };
  const d = extraData(input);
  await prisma.$transaction(async (tx) => {
    await tx.extraDevice.create({ data: { customerId, ...d } });
    await recordHistory(tx, { customerId, event: "extra_device_added", content: `추가 기기 제공: ${extraText(d)}`, actorId: user.id });
  });
  return done(customerId);
}

export async function updateExtraDevice(id: string, version: number, input: ExtraDeviceInput): Promise<Result<ExtraDeviceInput>> {
  const user = await requireUser();
  const current = await prisma.extraDevice.findUnique({ where: { id } });
  if (!current) return { ok: false, message: "추가 기기 내역을 찾을 수 없습니다. 새로고침하세요." };
  const errors = validateExtraDevice(input);
  if (Object.keys(errors).length) return { ok: false, errors, message: CHECK };

  const d = extraData(input);
  const changes = diff(extraInputOf(current), extraInputOf({ ...current, ...d }), EXTRA_LABELS, extraShow);
  if (!changes.length) return { ok: true };
  try {
    await prisma.$transaction(async (tx) => {
      await saveWithVersion(() => tx.extraDevice.updateMany({ where: { id, version }, data: { ...d, version: { increment: 1 } } }));
      await recordHistory(tx, {
        customerId: current.customerId,
        event: "extra_device_updated",
        content: `추가 기기 수정: ${changes.join(", ")}`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) {
      const latest = await prisma.extraDevice.findUnique({ where: { id } });
      if (!latest) return { ok: false, message: "다른 사용자가 이 항목을 삭제했습니다. 새로고침하세요." };
      return { ok: false, conflict: { ...(await lastEditor(current.customerId)), latest: extraInputOf(latest), version: latest.version } };
    }
    throw e;
  }
  return done(current.customerId);
}

export async function deleteExtraDevice(id: string): Promise<Result> {
  const user = await requireUser();
  const x = await prisma.extraDevice.findUnique({ where: { id } });
  if (!x) return { ok: false, message: "이미 삭제된 항목입니다. 새로고침하세요." };
  await prisma.$transaction(async (tx) => {
    await tx.extraDevice.delete({ where: { id } });
    await recordHistory(tx, { customerId: x.customerId, event: "extra_device_deleted", content: `추가 기기 삭제: ${extraText(x)}`, actorId: user.id });
  });
  return done(x.customerId);
}
