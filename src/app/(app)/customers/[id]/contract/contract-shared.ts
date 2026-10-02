// 계약·비용 탭 화면·서버 공용: DB 값 → 입력값 변환, 화면용 타입 (브라우저에서도 import 가능)
import type { ChargeInput, ContractInput, ExtraDeviceInput, OptionInput } from "@/lib/contract-input";
import { fromDbDate } from "@/lib/date";
import { formatWon } from "@/lib/money";

const ym = (d: Date | null) => (d ? fromDbDate(d).slice(0, 7) : "");
const won = (amount: number, isFree: boolean) => (isFree ? "" : formatWon(amount));

export function contractInputOf(c: {
  contractDate: Date;
  startDate: Date;
  endDate: Date;
  contractUsers: number;
  billingTiming: "PREPAID" | "POSTPAID";
  autoRenew: boolean;
  qtyHub: number;
  qtyBand: number;
  qtyCharger: number;
  qtyAdapter: number;
  memo: string | null;
}): ContractInput {
  return {
    contractDate: fromDbDate(c.contractDate),
    startDate: fromDbDate(c.startDate),
    endDate: fromDbDate(c.endDate),
    contractUsers: String(c.contractUsers),
    billingTiming: c.billingTiming,
    autoRenew: c.autoRenew ? "yes" : "no",
    qtyHub: String(c.qtyHub),
    qtyBand: String(c.qtyBand),
    qtyCharger: String(c.qtyCharger),
    qtyAdapter: String(c.qtyAdapter),
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
};

export type ContractTabData = {
  current: ContractView | null;
  past: ContractView[];
  options: Row<OptionInput>[];
  extras: Row<ExtraDeviceInput>[];
  monthlyTotal: number | null;
  trial: { startDate: string; endDate: string; qtyHub: number; qtyBand: number; qtyCharger: number; qtyAdapter: number } | null;
  excelNote: string | null; // 엑셀 이관 계약 정보 (계약 등록 시 참고)
};
