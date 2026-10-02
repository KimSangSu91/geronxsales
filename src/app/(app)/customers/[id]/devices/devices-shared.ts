// 장비 탭 화면·서버 공용 타입 (브라우저에서도 import 가능)
import type { OptionInput } from "@/lib/contract-input";

export type KindKey = "BAND" | "HUB" | "CHARGER" | "ADAPTER";

export type DevicesTabData = {
  rows: { kind: KindKey; contract: number | null; extra: number; trial: number; recovered: number | null }[];
  contract: {
    id: string;
    version: number;
    contractType: "PURCHASE" | "SUBSCRIPTION";
    unitPriceHub: number | null;
    unitPriceBand: number | null;
    unitPriceCharger: number | null;
  } | null;
  trial: { id: string; version: number; qtyHub: number; qtyBand: number; qtyCharger: number; qtyAdapter: number } | null;
  options: { id: string; version: number; input: OptionInput; recovered: number | null; providedOn: string }[];
};

// [수량 수정] 입력: 계약 제공(허브·밴드·충전기) / 체험 제공(어댑터 포함)
export type QtyInput = {
  contract: { hub: string; band: string; charger: string } | null;
  trial: { hub: string; band: string; charger: string; adapter: string } | null;
};
