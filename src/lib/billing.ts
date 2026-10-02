// 비용 계산 — 계약 금액·옵션상품·추가 기기·직접 추가 비용을 "비용 줄"로 정리 (기능정의서 4-4)
// 비용 항목 표, 리스트·요약의 월 비용, (3단계) 월별 청구가 모두 이 함수들을 사용
// 금액은 공급가(원, 정수). 월은 'YYYY-MM'
import { fromDbDate } from "@/lib/date";
import { formatWon } from "@/lib/money";

export type ContractPricing = {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;
  contractType: "PURCHASE" | "SUBSCRIPTION";
  qtyHub: number;
  qtyBand: number;
  qtyCharger: number;
  unitPriceHub: number | null;
  unitPriceBand: number | null;
  unitPriceCharger: number | null;
  purchasePayment: "LUMP_SUM" | "INSTALLMENT" | null;
  purchaseBillingMonth: string | null; // 'YYYY-MM' — 일시납 청구월 / 분납 시작월
  installmentMonths: number | null;
  managementFee: number | null;
  managementFeeStart: string | null; // 'YYYY-MM'
};

export type CostLine = {
  key: string;
  source: "CONTRACT" | "OPTION" | "EXTRA" | "MANUAL";
  label: string;
  detail: string;
  type: "ONE_TIME" | "MONTHLY";
  amount: number; // 일시: 금액 / 월: 월 금액
  isFree: boolean;
  billingMonth: string | null; // 일시 청구월
  fromMonth: string | null; // 월 비용 시작월
  toMonth: string | null; // 월 비용 종료월 (null = 계속)
};

const ym = (d: string) => d.slice(0, 7);
const ymText = (m: string) => m.replace("-", ".");

// 'YYYY-MM' + n개월
export function addMonthsYm(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// DB 계약 → 계산용 값
type DateOrNull = Date | null;
export function contractPricingOf(c: {
  startDate: Date;
  endDate: Date;
  contractType: "PURCHASE" | "SUBSCRIPTION";
  qtyHub: number;
  qtyBand: number;
  qtyCharger: number;
  unitPriceHub: number | null;
  unitPriceBand: number | null;
  unitPriceCharger: number | null;
  purchasePayment: "LUMP_SUM" | "INSTALLMENT" | null;
  purchaseBillingMonth: DateOrNull;
  installmentMonths: number | null;
  managementFee: number | null;
  managementFeeStart: DateOrNull;
}): ContractPricing {
  return {
    ...c,
    startDate: fromDbDate(c.startDate),
    endDate: fromDbDate(c.endDate),
    purchaseBillingMonth: c.purchaseBillingMonth ? ym(fromDbDate(c.purchaseBillingMonth)) : null,
    managementFeeStart: c.managementFeeStart ? ym(fromDbDate(c.managementFeeStart)) : null,
  };
}

// 구축형 총액 = 허브·밴드·충전기 단가 × 수량 합
export function purchaseTotal(p: Pick<ContractPricing, "qtyHub" | "qtyBand" | "qtyCharger" | "unitPriceHub" | "unitPriceBand" | "unitPriceCharger">) {
  return p.qtyHub * (p.unitPriceHub ?? 0) + p.qtyBand * (p.unitPriceBand ?? 0) + p.qtyCharger * (p.unitPriceCharger ?? 0);
}

// 분납 월 금액 (원 단위 내림 — 남는 차액은 마지막 회차에 더함)
export function installmentAmount(total: number, months: number) {
  return Math.floor(total / months);
}

// 계약 금액 → 비용 줄
export function contractLines(p: ContractPricing): CostLine[] {
  const lines: CostLine[] = [];
  const start = ym(p.startDate);
  const end = ym(p.endDate);
  const base = { source: "CONTRACT" as const, isFree: false };

  if (p.contractType === "PURCHASE") {
    const total = purchaseTotal(p);
    const parts = [
      p.qtyHub && `허브 ${p.qtyHub}×${formatWon(p.unitPriceHub ?? 0)}`,
      p.qtyBand && `밴드 ${p.qtyBand}×${formatWon(p.unitPriceBand ?? 0)}`,
      p.qtyCharger && `충전기 ${p.qtyCharger}×${formatWon(p.unitPriceCharger ?? 0)}`,
    ].filter(Boolean);
    if (p.purchasePayment === "INSTALLMENT" && p.installmentMonths && p.purchaseBillingMonth) {
      lines.push({
        ...base,
        key: "contract-installment",
        label: "구축 장비 (분납)",
        detail: `총 ${formatWon(total)}원 · ${p.installmentMonths}개월`,
        type: "MONTHLY",
        amount: installmentAmount(total, p.installmentMonths),
        billingMonth: null,
        fromMonth: p.purchaseBillingMonth,
        toMonth: addMonthsYm(p.purchaseBillingMonth, p.installmentMonths - 1),
      });
    } else {
      lines.push({
        ...base,
        key: "contract-purchase",
        label: "구축 장비",
        detail: parts.join(" + "),
        type: "ONE_TIME",
        amount: total,
        billingMonth: p.purchaseBillingMonth,
        fromMonth: null,
        toMonth: null,
      });
    }
  } else {
    lines.push({
      ...base,
      key: "contract-subscription",
      label: "구독료",
      detail: `밴드 ${p.qtyBand}×${formatWon(p.unitPriceBand ?? 0)}`,
      type: "MONTHLY",
      amount: p.qtyBand * (p.unitPriceBand ?? 0),
      billingMonth: null,
      fromMonth: start,
      toMonth: end,
    });
  }

  if (p.managementFee && p.managementFee > 0) {
    lines.push({
      ...base,
      key: "contract-management",
      label: "관리비",
      detail: "",
      type: "MONTHLY",
      amount: p.managementFee,
      billingMonth: null,
      fromMonth: p.managementFeeStart ?? start,
      // 관리비는 계약 종료월에 묶지 않음 ("n년 후부터"가 계약 기간 뒤일 수 있음) — 현재 계약 기준으로만 계산하므로 갱신 시 중복 없음
      toMonth: null,
    });
  }
  return lines;
}

// 일자 칸 표시
export function lineDateText(l: CostLine): string {
  if (l.type === "ONE_TIME") return l.billingMonth ? `청구 ${ymText(l.billingMonth)}` : "-";
  if (!l.fromMonth) return "매월";
  return `매월 ${ymText(l.fromMonth)}~${l.toMonth ? ymText(l.toMonth) : ""}`;
}

// 해당 월에 청구되는 월 비용 합계 (월 비용 줄이 하나도 없으면 null → "-")
export function monthlyTotalAt(lines: CostLine[], month: string): number | null {
  const monthly = lines.filter((l) => l.type === "MONTHLY" && !l.isFree);
  if (!monthly.length) return null;
  return monthly
    .filter((l) => (!l.fromMonth || l.fromMonth <= month) && (!l.toMonth || month <= l.toMonth))
    .reduce((s, l) => s + l.amount, 0);
}

// ───────── 고객사 전체 비용 줄: 계약 + 옵션상품 + 추가 기기 + 직접 추가 비용 ─────────

type DbContract = Parameters<typeof contractPricingOf>[0];
type DbCharge = { id: string; type: "ONE_TIME" | "MONTHLY"; name: string; amount: number; isFree: boolean; billingMonth: Date | null };
type DbOption = {
  id: string;
  category: "TABLET" | "TV" | "OTHER";
  categoryOther: string | null;
  productName: string;
  qty: number;
  providedOn: Date;
  chargeType: "ONE_TIME" | "MONTHLY";
  amount: number;
  isFree: boolean;
  billingMonth: Date | null;
};
type DbExtra = {
  id: string;
  kind: "BAND" | "HUB" | "CHARGER" | "ADAPTER" | "OTHER";
  kindOther: string | null;
  qty: number;
  amount: number;
  isFree: boolean;
  billingMonth: Date | null;
};

const OPTION_NAME = { TABLET: "태블릿", TV: "TV", OTHER: "기타" } as const;
const DEVICE_NAME = { BAND: "밴드", HUB: "허브", CHARGER: "충전기", ADAPTER: "어댑터", OTHER: "기타" } as const;
const monthOf = (d: Date | null) => (d ? ym(fromDbDate(d)) : null);

export function customerCostLines(input: {
  contract: DbContract | null; // 현재 계약
  charges: DbCharge[]; // 현재 계약의 직접 추가 비용
  options: DbOption[];
  extras: DbExtra[];
}): CostLine[] {
  const pricing = input.contract ? contractPricingOf(input.contract) : null;
  const lines: CostLine[] = pricing ? contractLines(pricing) : [];

  for (const o of input.options) {
    const monthly = o.chargeType === "MONTHLY";
    lines.push({
      key: `option-${o.id}`,
      source: "OPTION",
      label: o.category === "OTHER" ? (o.categoryOther ?? "기타") : OPTION_NAME[o.category],
      detail: `${o.productName} ${o.qty}개`,
      type: o.chargeType,
      amount: o.amount,
      isFree: o.isFree,
      billingMonth: monthly ? null : monthOf(o.billingMonth),
      // 월 옵션상품은 제공월부터 계속 (계약 종료월까지)
      fromMonth: monthly ? monthOf(o.providedOn) : null,
      toMonth: monthly && pricing ? ym(pricing.endDate) : null,
    });
  }
  for (const x of input.extras) {
    lines.push({
      key: `extra-${x.id}`,
      source: "EXTRA",
      label: `추가 기기 · ${x.kind === "OTHER" ? (x.kindOther ?? "기타") : DEVICE_NAME[x.kind]}`,
      detail: `${x.qty}개`,
      type: "ONE_TIME",
      amount: x.amount,
      isFree: x.isFree,
      billingMonth: monthOf(x.billingMonth),
      fromMonth: null,
      toMonth: null,
    });
  }
  for (const c of input.charges) {
    const monthly = c.type === "MONTHLY";
    lines.push({
      key: `charge-${c.id}`,
      source: "MANUAL",
      label: c.name,
      detail: "",
      type: c.type,
      amount: c.amount,
      isFree: c.isFree,
      billingMonth: monthly ? null : monthOf(c.billingMonth),
      // 직접 추가한 월 비용은 계약 기간 동안
      fromMonth: monthly && pricing ? ym(pricing.startDate) : null,
      toMonth: monthly && pricing ? ym(pricing.endDate) : null,
    });
  }
  return lines;
}

// 일시 비용 합계 (무상 제외)
export function oneTimeTotal(lines: CostLine[]): number {
  return lines.filter((l) => l.type === "ONE_TIME" && !l.isFree).reduce((s, l) => s + l.amount, 0);
}
