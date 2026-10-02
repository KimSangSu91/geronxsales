"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { purchaseTotal } from "@/lib/billing";
import { recordHistory } from "@/lib/history";
import { lastEditor } from "@/lib/last-editor";
import { formatWon } from "@/lib/money";
import { ConflictError, saveWithVersion } from "@/lib/optimistic";
import { prisma } from "@/lib/prisma";
import type { QtyInput } from "./devices-shared";

type Result = { ok: true } | { ok: false; message: string; conflict?: { editorName: string; editedAt: string } };

const qty = (v: string) => (/^\d+$/.test(v.trim()) && Number(v) <= 100000 ? Number(v) : NaN);

// [수량 수정]: 계약 제공·체험 제공 수량을 바로 수정 — 계약 수량이 바뀌면 금액(구독료·구축 총액)도 바뀜
export async function updateDeviceQty(
  customerId: string,
  versions: { contract?: number; trial?: number },
  input: QtyInput,
): Promise<Result> {
  const user = await requireUser();
  const changes: string[] = [];

  const contract = input.contract ? await prisma.contract.findFirst({ where: { customerId, state: "CURRENT" } }) : null;
  const trial = input.trial
    ? await prisma.trial.findFirst({ where: { customerId, result: "IN_PROGRESS" }, orderBy: { createdAt: "desc" } })
    : null;
  if (input.contract && !contract) return { ok: false, message: "현재 계약이 없습니다. 새로고침하세요." };
  if (input.trial && !trial) return { ok: false, message: "진행 중인 체험이 없습니다. 새로고침하세요." };

  let contractData: { qtyHub: number; qtyBand: number; qtyCharger: number } | null = null;
  if (contract && input.contract) {
    const next = { qtyHub: qty(input.contract.hub), qtyBand: qty(input.contract.band), qtyCharger: qty(input.contract.charger) };
    if (Object.values(next).some(Number.isNaN)) return { ok: false, message: "수량은 0 이상의 숫자로 입력하세요." };
    if (next.qtyHub + next.qtyBand + next.qtyCharger <= 0) return { ok: false, message: "계약 제공 수량이 모두 0일 수는 없습니다." };
    if (contract.contractType === "SUBSCRIPTION" && next.qtyBand <= 0) return { ok: false, message: "구독형 계약은 밴드 수량이 필요합니다." };
    if (contract.contractType === "PURCHASE") {
      const noPrice = [
        next.qtyHub > 0 && contract.unitPriceHub === null && "허브",
        next.qtyBand > 0 && contract.unitPriceBand === null && "밴드",
        next.qtyCharger > 0 && contract.unitPriceCharger === null && "충전기",
      ].filter(Boolean);
      if (noPrice.length) return { ok: false, message: `${noPrice.join("·")} 단가가 없습니다. 계약 내용에서 단가를 먼저 입력하세요.` };
    }
    const labels = [
      ["qtyHub", "허브"],
      ["qtyBand", "밴드"],
      ["qtyCharger", "충전기"],
    ] as const;
    const diff = labels.filter(([k]) => contract[k] !== next[k]).map(([k, l]) => `${l} ${contract[k]} → ${next[k]}`);
    if (diff.length) {
      contractData = next;
      const price = (q: typeof next) =>
        contract.contractType === "SUBSCRIPTION"
          ? `월 구독료 ${formatWon(q.qtyBand * (contract.unitPriceBand ?? 0))}원`
          : `구축 총액 ${formatWon(purchaseTotal({ ...contract, ...q }))}원`;
      const before = price(contract);
      const after = price(next);
      changes.push(`계약 ${diff.join(", ")}${before !== after ? ` (${before.replace(/원$/, "")} → ${after.replace(/^[^0-9]*/, "")})` : ""}`);
    }
  }

  let trialData: { qtyHub: number; qtyBand: number; qtyCharger: number; qtyAdapter: number } | null = null;
  if (trial && input.trial) {
    const next = {
      qtyHub: qty(input.trial.hub),
      qtyBand: qty(input.trial.band),
      qtyCharger: qty(input.trial.charger),
      qtyAdapter: qty(input.trial.adapter),
    };
    if (Object.values(next).some(Number.isNaN)) return { ok: false, message: "수량은 0 이상의 숫자로 입력하세요." };
    const labels = [
      ["qtyHub", "허브"],
      ["qtyBand", "밴드"],
      ["qtyCharger", "충전기"],
      ["qtyAdapter", "어댑터"],
    ] as const;
    const diff = labels.filter(([k]) => trial[k] !== next[k]).map(([k, l]) => `${l} ${trial[k]} → ${next[k]}`);
    if (diff.length) {
      trialData = next;
      changes.push(`체험 ${diff.join(", ")}`);
    }
  }
  if (!changes.length) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      if (contract && contractData) {
        await saveWithVersion(() =>
          tx.contract.updateMany({
            where: { id: contract.id, version: versions.contract ?? -1 },
            data: { ...contractData!, version: { increment: 1 } },
          }),
        );
      }
      if (trial && trialData) {
        await saveWithVersion(() =>
          tx.trial.updateMany({ where: { id: trial.id, version: versions.trial ?? -1 }, data: { ...trialData!, version: { increment: 1 } } }),
        );
      }
      await recordHistory(tx, {
        customerId,
        event: "device_qty_updated",
        content: `장비 수량 수정: ${changes.join(" / ")}`,
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) {
      return { ok: false, message: "다른 사용자가 먼저 계약·체험 정보를 수정했습니다. 새로고침 후 다시 입력하세요.", conflict: await lastEditor(customerId) };
    }
    throw e;
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}
