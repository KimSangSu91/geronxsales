import "server-only";
import { fromDbDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { optionInputOf } from "../contract/contract-shared";
import type { DevicesTabData, KindKey } from "./devices-shared";

const KINDS: KindKey[] = ["BAND", "HUB", "CHARGER", "ADAPTER"];

// 장비 탭: 기기별 계약·추가·체험 제공 수량, 회수 수량, 옵션상품 (기능정의서 4-15)
export async function getDevicesData(customerId: string, status: string): Promise<DevicesTabData> {
  const [contract, extras, trials, closure, options] = await Promise.all([
    prisma.contract.findFirst({ where: { customerId, state: "CURRENT" } }),
    prisma.extraDevice.findMany({ where: { customerId }, select: { kind: true, qty: true } }),
    // 체험 제공: 계약으로 전환되지 않은 체험 (전환된 체험 장비는 계약 수량에 포함 — 회수 체크리스트와 같은 기준)
    prisma.trial.findMany({ where: { customerId, result: { not: "CONVERTED" } }, orderBy: { createdAt: "desc" } }),
    prisma.closure.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" }, include: { recovery: true } }),
    prisma.optionProduct.findMany({ where: { customerId }, orderBy: { providedOn: "desc" } }),
  ]);

  const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
  const trialQty = (k: KindKey) =>
    sum(trials, (t) => (k === "BAND" ? t.qtyBand : k === "HUB" ? t.qtyHub : k === "CHARGER" ? t.qtyCharger : t.qtyAdapter));
  const contractQty = (k: KindKey) =>
    !contract ? 0 : k === "BAND" ? contract.qtyBand : k === "HUB" ? contract.qtyHub : k === "CHARGER" ? contract.qtyCharger : null;

  const rows = KINDS.map((kind) => ({
    kind,
    contract: contractQty(kind), // 어댑터는 계약에 없음 → null
    extra: sum(extras.filter((x) => x.kind === kind), (x) => x.qty),
    trial: trialQty(kind),
    recovered: closure ? sum(closure.recovery.filter((r) => r.kind === kind), (r) => r.recoveredQty) : null,
  }));

  // 수정 가능한 체험 = 진행 중인 체험 1건 (체험중일 때)
  const editableTrial = status === "TRIAL" ? trials.find((t) => t.result === "IN_PROGRESS") : undefined;

  return {
    rows,
    contract: contract
      ? {
          id: contract.id,
          version: contract.version,
          contractType: contract.contractType,
          unitPriceHub: contract.unitPriceHub,
          unitPriceBand: contract.unitPriceBand,
          unitPriceCharger: contract.unitPriceCharger,
        }
      : null,
    trial: editableTrial
      ? {
          id: editableTrial.id,
          version: editableTrial.version,
          qtyHub: editableTrial.qtyHub,
          qtyBand: editableTrial.qtyBand,
          qtyCharger: editableTrial.qtyCharger,
          qtyAdapter: editableTrial.qtyAdapter,
        }
      : null,
    options: options.map((o) => ({
      id: o.id,
      version: o.version,
      input: optionInputOf(o),
      recovered: closure?.recovery.find((r) => r.kind === "OTHER" && r.label === o.productName)?.recoveredQty ?? null,
      providedOn: fromDbDate(o.providedOn),
    })),
  };
}
