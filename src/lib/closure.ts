import "server-only";
import type { DeviceKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { CLOSURE_ITEM_CODES } from "@/lib/status-rules";

type Tx = Prisma.TransactionClient;


// 회수·종료 체크리스트: Closure + 항목 + 기기별 제공 수량 (기능정의서 4-5-2)
// 제공 수량 = 현재 계약 장비 + 추가 제공 기기 + 체험 장비(계약 전환되지 않은 체험) / 옵션상품은 품목별
export async function createClosure(tx: Tx, customerId: string, type: "NOT_CONVERTED" | "ENDED" | "TERMINATED") {
  const [contract, extras, trials, options, items] = await Promise.all([
    tx.contract.findFirst({ where: { customerId, state: "CURRENT" } }),
    tx.extraDevice.findMany({ where: { customerId }, select: { kind: true, kindOther: true, qty: true } }),
    tx.trial.findMany({ where: { customerId, result: { not: "CONVERTED" } } }),
    tx.optionProduct.findMany({ where: { customerId }, select: { productName: true, qty: true } }),
    tx.checklistItem.findMany({ where: { code: { in: CLOSURE_ITEM_CODES[type] }, isActive: true }, select: { id: true } }),
  ]);

  const base: Record<"HUB" | "BAND" | "CHARGER" | "ADAPTER", number> = {
    HUB: contract?.qtyHub ?? 0,
    BAND: contract?.qtyBand ?? 0,
    CHARGER: contract?.qtyCharger ?? 0,
    ADAPTER: 0, // 계약에는 어댑터 없음 (체험·추가 기기만)
  };
  for (const t of trials) {
    base.HUB += t.qtyHub;
    base.BAND += t.qtyBand;
    base.CHARGER += t.qtyCharger;
    base.ADAPTER += t.qtyAdapter;
  }
  const others: { kind: DeviceKind; label: string; providedQty: number }[] = [];
  for (const x of extras) {
    if (x.kind === "OTHER") others.push({ kind: "OTHER", label: x.kindOther ?? "기타 기기", providedQty: x.qty });
    else base[x.kind] += x.qty;
  }
  for (const o of options) others.push({ kind: "OTHER", label: o.productName, providedQty: o.qty });

  await tx.closure.create({
    data: {
      customerId,
      type,
      entries: { create: items.map((i) => ({ customerId, itemId: i.id })) },
      recovery: {
        create: [
          ...(["BAND", "HUB", "CHARGER", "ADAPTER"] as const).map((kind) => ({ kind, providedQty: base[kind] })),
          ...others,
        ],
      },
    },
  });
}
