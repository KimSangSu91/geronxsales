// 계약·비용 탭 화면·서버 공용: DB 값 → 입력값 변환, 화면용 타입 (브라우저에서도 import 가능)
import type { ChargeInput, ContractInput, ExtraDeviceInput, OptionInput } from "@/lib/contract-input";
import type { CostLine } from "@/lib/billing";
import { fromDbDate } from "@/lib/date";
import { formatWon } from "@/lib/money";

const ym = (d: Date | null) => (d ? fromDbDate(d).slice(0, 7) : "");
const won = (amount: number, isFree: boolean) => (isFree ? "" : formatWon(amount));

export function contractInputOf(c: {
  contractDate: Date;
  startDate: Date;
  endDate: Date;
  contractUsers: number;
  autoRenew: boolean;
  autoRenewMonths: number | null;
  qtyHub: number;
  qtyBand: number;
  qtyCharger: number;
  contractType: "PURCHASE" | "SUBSCRIPTION";
  joinFee: number | null;
  unitPriceHub: number | null;
  unitPriceBand: number | null;
  unitPriceCharger: number | null;
  purchasePayment: "LUMP_SUM" | "INSTALLMENT" | null;
  purchaseBillingMonth: Date | null;
  installmentMonths: number | null;
  managementFee: number | null;
  managementFeeStart: Date | null;
  memo: string | null;
}): ContractInput {
  const price = (v: number | null) => (v === null ? "" : formatWon(v));
  return {
    contractDate: fromDbDate(c.contractDate),
    startDate: fromDbDate(c.startDate),
    endDate: fromDbDate(c.endDate),
    contractUsers: String(c.contractUsers),
    autoRenew: c.autoRenew ? "yes" : "no",
    autoRenewMonths: c.autoRenewMonths ? String(c.autoRenewMonths) : "",
    qtyHub: String(c.qtyHub),
    qtyBand: String(c.qtyBand),
    qtyCharger: String(c.qtyCharger),
    contractType: c.contractType,
    joinFee: c.joinFee ? formatWon(c.joinFee) : "",
    unitPriceHub: price(c.unitPriceHub),
    unitPriceBand: price(c.unitPriceBand),
    unitPriceCharger: price(c.unitPriceCharger),
    purchasePayment: c.purchasePayment ?? "LUMP_SUM",
    purchaseBillingMonth: ym(c.purchaseBillingMonth),
    installmentMonths: c.installmentMonths ? String(c.installmentMonths) : "",
    managementFee: c.managementFee ? formatWon(c.managementFee) : "",
    managementFeeStart: ym(c.managementFeeStart),
    memo: c.memo ?? "",
  };
}

export function chargeInputOf(c: {
  type: "ONE_TIME" | "MONTHLY";
  name: string;
  amount: number;
  isFree: boolean;
  freeReason: string | null;
  billingMonth: Date | null;
}): ChargeInput {
  return {
    type: c.type,
    name: c.name,
    amount: won(c.amount, c.isFree),
    isFree: c.isFree,
    freeReason: c.freeReason ?? "",
    billingMonth: ym(c.billingMonth),
  };
}

export function optionInputOf(o: {
  category: "TABLET" | "TV" | "OTHER";
  categoryOther: string | null;
  productName: string;
  qty: number;
  providedOn: Date;
  chargeType: "ONE_TIME" | "MONTHLY";
  amount: number;
  isFree: boolean;
  freeReason: string | null;
  billingMonth: Date | null;
  memo: string | null;
}): OptionInput {
  return {
    category: o.category,
    categoryOther: o.categoryOther ?? "",
    productName: o.productName,
    qty: String(o.qty),
    providedOn: fromDbDate(o.providedOn),
    chargeType: o.chargeType,
    amount: won(o.amount, o.isFree),
    isFree: o.isFree,
    freeReason: o.freeReason ?? "",
    billingMonth: ym(o.billingMonth),
    memo: o.memo ?? "",
  };
}

export function extraInputOf(x: {
  kind: "BAND" | "HUB" | "CHARGER" | "ADAPTER" | "OTHER";
  kindOther: string | null;
  qty: number;
  reason: "LOST" | "BROKEN" | "EXPANSION" | "OTHER";
  reasonOther: string | null;
  providedOn: Date;
  amount: number;
  isFree: boolean;
  freeReason: string | null;
  billingMonth: Date | null;
  memo: string | null;
}): ExtraDeviceInput {
  return {
    kind: x.kind,
    kindOther: x.kindOther ?? "",
    qty: String(x.qty),
    reason: x.reason,
    reasonOther: x.reasonOther ?? "",
    providedOn: fromDbDate(x.providedOn),
    amount: won(x.amount, x.isFree),
    isFree: x.isFree,
    freeReason: x.freeReason ?? "",
    billingMonth: ym(x.billingMonth),
    memo: x.memo ?? "",
  };
}

// ───────── 화면용 데이터 ─────────

export type Row<T> = { id: string; version: number; input: T };

export type ContractView = {
  id: string;
  version: number;
  state: "CURRENT" | "PAST" | "VOID";
  origin: "NEW" | "RENEWAL" | "AUTO_RENEWAL" | "MIGRATION";
  input: ContractInput;
  charges: Row<ChargeInput>[];
  contractDoc: { id: string; fileName: string } | null; // 이 계약의 계약서 (문서 탭에서 업로드)
  renewal: { cancelled: boolean; cancelReason: string | null; autoRenewConfirmed: boolean };
};

export type ContractTabData = {
  current: ContractView | null;
  lines: CostLine[]; // 비용 항목 표의 자동 줄 (계약·옵션상품·추가 기기)
  thisMonth: string; // 'YYYY-MM' 월 비용 기준
  past: ContractView[];
  options: Row<OptionInput>[];
  extras: Row<ExtraDeviceInput>[];
  monthlyTotal: number | null; // 이번 달 월 비용 합계
  oneTimeTotal: number; // 일시 비용 합계
  trial: { startDate: string; endDate: string; qtyHub: number; qtyBand: number; qtyCharger: number; qtyAdapter: number } | null;
  excelNote: string | null; // 엑셀 이관 계약 정보 (계약 등록 시 참고)
};
