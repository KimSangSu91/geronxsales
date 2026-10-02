// 계약·비용 입력값 검사 — 화면·서버 공용 (기능정의서 4-4)
// 금액은 공급가(원, 정수). 무상이면 0원 + 무상 사유 필수 (기능정의서 공통 UI 원칙)
import type { FieldErrors } from "@/lib/customer-input";
import { isDateString, toDbDate } from "@/lib/date";
import {
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

// ───────── 계약 (계약 내용 + 계약 금액) ─────────

export type ContractInput = {
  contractDate: string;
  startDate: string;
  endDate: string;
  contractUsers: string;
  autoRenew: "yes" | "no";
  autoRenewMonths: string; // 자동연장 기간(개월)
  qtyHub: string;
  qtyBand: string;
  qtyCharger: string;
  contractType: "PURCHASE" | "SUBSCRIPTION";
  joinFee: string; // 가입비 (선택, 1회성 — 계약 시작월 청구)
  unitPriceHub: string; // 금액 입력은 쉼표 포함 문자열
  unitPriceBand: string; // 구축형: 밴드 단가 / 구독형: 밴드 월 단가
  unitPriceCharger: string;
  purchasePayment: "LUMP_SUM" | "INSTALLMENT";
  purchaseBillingMonth: string; // 'YYYY-MM' 일시납 청구월 / 분납 시작월
  installmentMonths: string;
  managementFee: string; // 월 관리비 (선택)
  managementFeeStart: string; // 'YYYY-MM'
  memo: string;
};

export const emptyContract = (): ContractInput => ({
  contractDate: "",
  startDate: "",
  endDate: "",
  contractUsers: "",
  autoRenew: "yes",
  autoRenewMonths: "12",
  qtyHub: "",
  qtyBand: "",
  qtyCharger: "",
  contractType: "SUBSCRIPTION",
  joinFee: "",
  unitPriceHub: "",
  unitPriceBand: "",
  unitPriceCharger: "",
  purchasePayment: "LUMP_SUM",
  purchaseBillingMonth: "",
  installmentMonths: "",
  managementFee: "",
  managementFeeStart: "",
  memo: "",
});

export const AUTO_RENEW_PRESETS = [6, 12, 24];

const qtyOf = (v: string) => (v.trim() ? Number(v) : 0);
const priceOk = (v: string) => !Number.isNaN(parseAmount(v));

export function validateContract(c: ContractInput): FieldErrors {
  const e: FieldErrors = {};
  if (!isDateString(c.contractDate)) e.contractDate = "계약일을 선택하세요.";
  if (!isDateString(c.startDate)) e.startDate = "시작일을 선택하세요.";
  if (!isDateString(c.endDate)) e.endDate = "종료일을 선택하세요.";
  else if (isDateString(c.startDate) && c.endDate < c.startDate) e.endDate = "종료일은 시작일 이후여야 합니다.";
  if (!isInt(c.contractUsers, 1)) e.contractUsers = "계약 인원을 1 이상 숫자로 입력하세요.";
  if (c.autoRenew !== "yes" && c.autoRenew !== "no") e.autoRenew = "자동연장 여부를 선택하세요.";
  else if (c.autoRenew === "yes" && !isInt(c.autoRenewMonths, 1, 120)) e.autoRenewMonths = "연장 기간(개월)을 입력하세요.";

  for (const k of ["qtyHub", "qtyBand", "qtyCharger"] as const) {
    if (c[k].trim() && !isInt(c[k])) e[k] = "0 이상 숫자";
  }
  if (!e.qtyHub && !e.qtyBand && !e.qtyCharger && qtyOf(c.qtyHub) + qtyOf(c.qtyBand) + qtyOf(c.qtyCharger) <= 0)
    e.qty = "제공 장비 수량을 입력하세요.";

  if (c.contractType !== "PURCHASE" && c.contractType !== "SUBSCRIPTION") e.contractType = "구축형/구독형을 선택하세요.";
  else if (c.contractType === "PURCHASE") {
    // 수량이 있는 장비는 단가 필수 (0원 = 무상 제공 가능)
    const pairs = [
      ["qtyHub", "unitPriceHub"],
      ["qtyBand", "unitPriceBand"],
      ["qtyCharger", "unitPriceCharger"],
    ] as const;
    for (const [q, pr] of pairs) if (qtyOf(c[q]) > 0 && !priceOk(c[pr])) e[pr] = "단가를 입력하세요.";
    if (c.purchasePayment !== "LUMP_SUM" && c.purchasePayment !== "INSTALLMENT") e.purchasePayment = "납부 방법을 선택하세요.";
    if (!MONTH_RE.test(c.purchaseBillingMonth))
      e.purchaseBillingMonth = c.purchasePayment === "INSTALLMENT" ? "분납 시작월을 선택하세요." : "청구월을 선택하세요.";
    if (c.purchasePayment === "INSTALLMENT" && !isInt(c.installmentMonths, 2, 120)) e.installmentMonths = "분납 개월 수(2 이상)를 입력하세요.";
  } else {
    if (qtyOf(c.qtyBand) <= 0) e.qtyBand = "구독형은 밴드 수량이 필요합니다.";
    if (!priceOk(c.unitPriceBand)) e.unitPriceBand = "밴드 월 단가를 입력하세요.";
  }

  if (c.joinFee.trim() && Number.isNaN(parseAmount(c.joinFee))) e.joinFee = "금액을 숫자로 입력하세요.";

  if (c.managementFee.trim()) {
    const fee = parseAmount(c.managementFee);
    if (Number.isNaN(fee)) e.managementFee = "금액을 숫자로 입력하세요.";
    else if (fee > 0 && !MONTH_RE.test(c.managementFeeStart)) e.managementFeeStart = "관리비 청구 시작월을 선택하세요.";
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

// ───────── 저장값 변환 ─────────
const qtyNum = (v: string) => (v.trim() ? Number(v) : 0);
const monthDate = (ym: string) => (ym ? toDbDate(`${ym}-01`) : null);

// 계약 입력값 → DB 저장값 (등록·수정·갱신 공용)
export function contractDataOf(c: ContractInput) {
  const purchase = c.contractType === "PURCHASE";
  const installment = purchase && c.purchasePayment === "INSTALLMENT";
  const amount = (v: string) => (v.trim() ? parseAmount(v) : null);
  const fee = amount(c.managementFee);
  return {
    contractDate: toDbDate(c.contractDate),
    startDate: toDbDate(c.startDate),
    endDate: toDbDate(c.endDate),
    contractUsers: Number(c.contractUsers),
    autoRenew: c.autoRenew === "yes",
    autoRenewMonths: c.autoRenew === "yes" ? Number(c.autoRenewMonths) : null,
    qtyHub: qtyNum(c.qtyHub),
    qtyBand: qtyNum(c.qtyBand),
    qtyCharger: qtyNum(c.qtyCharger),
    contractType: c.contractType,
    joinFee: (() => {
      const j = amount(c.joinFee);
      return j && j > 0 ? j : null;
    })(),
    // 구독형은 밴드 월 단가만 사용
    unitPriceHub: purchase ? amount(c.unitPriceHub) : null,
    unitPriceBand: amount(c.unitPriceBand),
    unitPriceCharger: purchase ? amount(c.unitPriceCharger) : null,
    purchasePayment: purchase ? c.purchasePayment : null,
    purchaseBillingMonth: purchase ? monthDate(c.purchaseBillingMonth) : null,
    installmentMonths: installment ? Number(c.installmentMonths) : null,
    managementFee: fee && fee > 0 ? fee : null,
    managementFeeStart: fee && fee > 0 ? monthDate(c.managementFeeStart) : null,
    memo: c.memo.trim() || null,
  };
}
