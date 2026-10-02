// 계약·비용 입력값 검사 — 화면·서버 공용 (기능정의서 4-4)
// 금액은 공급가(원, 정수). 무상이면 0원 + 무상 사유 필수 (기능정의서 공통 UI 원칙)
import type { FieldErrors } from "@/lib/customer-input";
import { isDateString } from "@/lib/date";
import {
  BILLING_TIMING_LABEL,
  CHARGE_TYPE_LABEL,
  DEVICE_KIND_LABEL,
  EXTRA_REASON_LABEL,
  OPTION_CATEGORY_LABEL,
} from "@/lib/labels";

const isInt = (v: string, min = 0, max = 1_000_000) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;
const has = (labels: object, v: string) => !!v && Object.hasOwn(labels, v);

// 청구월 'YYYY-MM'
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// 금액 입력 "1,500,000" → 1500000 (숫자가 아니면 NaN)
export function parseAmount(v: string): number {
  const s = v.replace(/[,\s원]/g, "");
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

// ───────── 계약 ─────────

export type ContractInput = {
  contractDate: string;
  startDate: string;
  endDate: string;
  contractUsers: string;
  billingTiming: "PREPAID" | "POSTPAID";
  autoRenew: "yes" | "no";
  qtyHub: string;
  qtyBand: string;
  qtyCharger: string;
  qtyAdapter: string;
  memo: string;
};

export const emptyContract = (): ContractInput => ({
  contractDate: "",
  startDate: "",
  endDate: "",
  contractUsers: "",
  billingTiming: "POSTPAID",
  autoRenew: "yes",
  qtyHub: "",
  qtyBand: "",
  qtyCharger: "",
  qtyAdapter: "",
  memo: "",
});

export function validateContract(c: ContractInput): FieldErrors {
  const e: FieldErrors = {};
  if (!isDateString(c.contractDate)) e.contractDate = "계약일을 선택하세요.";
  if (!isDateString(c.startDate)) e.startDate = "시작일을 선택하세요.";
  if (!isDateString(c.endDate)) e.endDate = "종료일을 선택하세요.";
  else if (isDateString(c.startDate) && c.endDate < c.startDate) e.endDate = "종료일은 시작일 이후여야 합니다.";
  if (!isInt(c.contractUsers, 1)) e.contractUsers = "계약 인원을 1 이상 숫자로 입력하세요.";
  if (!has(BILLING_TIMING_LABEL, c.billingTiming)) e.billingTiming = "선불/후불을 선택하세요.";
  if (c.autoRenew !== "yes" && c.autoRenew !== "no") e.autoRenew = "자동연장 여부를 선택하세요.";
  for (const k of ["qtyHub", "qtyBand", "qtyCharger", "qtyAdapter"] as const) {
    if (c[k].trim() && !isInt(c[k])) e[k] = "0 이상 숫자";
  }
  return e;
}

// ───────── 금액 공통 (무상·청구월) ─────────

type Priced = { amount: string; isFree: boolean; freeReason: string; billingMonth: string };

function validatePrice(p: Priced, oneTime: boolean, e: FieldErrors) {
  if (p.isFree) {
    if (!p.freeReason.trim()) e.freeReason = "무상 사유를 입력하세요.";
  } else {
    const n = parseAmount(p.amount);
    if (Number.isNaN(n)) e.amount = "금액을 숫자로 입력하세요.";
    else if (n <= 0) e.amount = "금액을 입력하거나 무상에 체크하세요.";
    else if (n > 2_000_000_000) e.amount = "금액이 너무 큽니다.";
  }
  // 일시 비용은 청구월 1개 (무상이면 청구하지 않으므로 생략 가능)
  if (oneTime && !p.isFree && !MONTH_RE.test(p.billingMonth)) e.billingMonth = "청구월을 선택하세요.";
  if (p.billingMonth && !MONTH_RE.test(p.billingMonth)) e.billingMonth = "청구월을 다시 선택하세요.";
}

// ───────── 비용 항목 ─────────

export const CHARGE_NAME_PRESETS = ["가입비", "설치비", "연간 이용료", "월 이용료", "관리비"];

export type ChargeInput = Priced & { type: "ONE_TIME" | "MONTHLY"; name: string };

export const emptyCharge = (): ChargeInput => ({
  type: "MONTHLY",
  name: "",
  amount: "",
  isFree: false,
  freeReason: "",
  billingMonth: "",
});

export function validateCharge(c: ChargeInput): FieldErrors {
  const e: FieldErrors = {};
  if (!has(CHARGE_TYPE_LABEL, c.type)) e.type = "비용 유형을 선택하세요.";
  if (!c.name.trim()) e.name = "항목명을 입력하세요.";
  validatePrice(c, c.type === "ONE_TIME", e);
  return e;
}

// ───────── 옵션상품 ─────────

export type OptionInput = Priced & {
  category: "TABLET" | "TV" | "OTHER" | "";
  categoryOther: string;
  productName: string;
  qty: string;
  providedOn: string;
  chargeType: "ONE_TIME" | "MONTHLY";
  memo: string;
};

export const emptyOption = (): OptionInput => ({
  category: "",
  categoryOther: "",
  productName: "",
  qty: "1",
  providedOn: "",
  chargeType: "ONE_TIME",
  amount: "",
  isFree: false,
  freeReason: "",
  billingMonth: "",
  memo: "",
});

export function validateOption(o: OptionInput): FieldErrors {
  const e: FieldErrors = {};
  if (!has(OPTION_CATEGORY_LABEL, o.category)) e.category = "상품 구분을 선택하세요.";
  else if (o.category === "OTHER" && !o.categoryOther.trim()) e.categoryOther = "구분을 직접 입력하세요.";
  if (!o.productName.trim()) e.productName = "제품명·모델을 입력하세요.";
  if (!isInt(o.qty, 1)) e.qty = "수량을 1 이상 숫자로 입력하세요.";
  if (!isDateString(o.providedOn)) e.providedOn = "제공일을 선택하세요.";
  if (!has(CHARGE_TYPE_LABEL, o.chargeType)) e.chargeType = "비용 유형을 선택하세요.";
  validatePrice(o, o.chargeType === "ONE_TIME", e);
  return e;
}

// ───────── 추가 기기 제공 ─────────

export type ExtraDeviceInput = Priced & {
  kind: "BAND" | "HUB" | "CHARGER" | "ADAPTER" | "OTHER" | "";
  kindOther: string;
  qty: string;
  reason: "LOST" | "BROKEN" | "EXPANSION" | "OTHER" | "";
  reasonOther: string;
  providedOn: string;
  memo: string;
};

export const emptyExtraDevice = (): ExtraDeviceInput => ({
  kind: "",
  kindOther: "",
  qty: "1",
  reason: "",
  reasonOther: "",
  providedOn: "",
  amount: "",
  isFree: false,
  freeReason: "",
  billingMonth: "",
  memo: "",
});

export function validateExtraDevice(x: ExtraDeviceInput): FieldErrors {
  const e: FieldErrors = {};
  if (!has(DEVICE_KIND_LABEL, x.kind)) e.kind = "기기 종류를 선택하세요.";
  else if (x.kind === "OTHER" && !x.kindOther.trim()) e.kindOther = "기기명을 입력하세요.";
  if (!isInt(x.qty, 1)) e.qty = "수량을 1 이상 숫자로 입력하세요.";
  if (!has(EXTRA_REASON_LABEL, x.reason)) e.reason = "제공 사유를 선택하세요.";
  else if (x.reason === "OTHER" && !x.reasonOther.trim()) e.reasonOther = "사유를 직접 입력하세요.";
  if (!isDateString(x.providedOn)) e.providedOn = "제공일을 선택하세요.";
  // 추가 기기는 일시 비용
  validatePrice(x, true, e);
  return e;
}
