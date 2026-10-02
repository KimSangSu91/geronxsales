"use server";

import { revalidatePath } from "next/cache";
import type { CustomerStatus, DeviceKind } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { formatDate, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { CUSTOMER_STATUS_LABEL, CUSTOMER_STATUSES } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import {
  CLOSURE_ITEM_CODES,
  closureTypeFor,
  missingForStatus,
  summarizeItems,
  transitionInputErrors,
  type MissingItem,
  type TransitionInput,
} from "@/lib/status-rules";
import { getStatusFacts } from "./status-data";

export type ChangeStatusResult =
  | { ok: true }
  | {
      ok: false;
      message?: string;
      stale?: boolean; // 그 사이 다른 사람이 상태를 바꿈 → 새로고침
      errors?: Record<string, string>; // 창 입력 오류
      missing?: MissingItem[]; // 필수 항목 누락 → 전환 불가 창
      incomplete?: string[]; // 사용중 전환 시 미완료 도입 체크리스트 → 확인창
    };

const n = (v: string) => (v.trim() ? Number(v) : 0);

export async function changeStatus(
  customerId: string,
  expected: CustomerStatus, // 창을 열 때의 상태
  target: CustomerStatus,
  input: TransitionInput,
  confirmIncomplete = false,
): Promise<ChangeStatusResult> {
  const user = await requireUser();
  if (!CUSTOMER_STATUSES.includes(target)) return { ok: false, message: "잘못된 상태입니다." };

  const current = await prisma.customer.findUnique({ where: { id: customerId }, select: { status: true } });
  if (!current) return { ok: false, message: "고객사를 찾을 수 없습니다." };
  if (current.status !== expected) {
    return { ok: false, stale: true, message: `이미 ${CUSTOMER_STATUS_LABEL[current.status]} 상태로 변경되었습니다.` };
  }
  if (target === expected) return { ok: false, message: "현재와 같은 상태입니다." };

  const errors = transitionInputErrors(target, input);
  if (Object.keys(errors).length) return { ok: false, errors, message: "입력 내용을 확인하세요." };

  const facts = await getStatusFacts(prisma, customerId);
  const missing = missingForStatus(target, facts!);
  if (missing.length) return { ok: false, missing };

  // 사용중 전환: 도입 체크리스트 미완료는 막지 않고 확인만
  let incomplete: string[] = [];
  if (target === "ACTIVE") {
    const entries = await prisma.checklistEntry.findMany({
      where: { customerId, closureId: null, done: false, item: { kind: "ONBOARDING" } },
      select: { item: { select: { label: true, sortOrder: true } } },
    });
    incomplete = entries.sort((a, b) => a.item.sortOrder - b.item.sortOrder).map((e) => e.item.label);
    if (incomplete.length && !confirmIncomplete) return { ok: false, incomplete };
  }

  const closureType = closureTypeFor(expected, target);
  const endedOn = target === "ENDED" || target === "TERMINATED" ? input.endedOn : null;
  const reason = ["TERMINATED", "NOT_CONVERTED", "OTHER"].includes(target) ? input.reason.trim() : null;

  try {
    await prisma.$transaction(async (tx) => {
      // 창을 연 뒤 다른 사람이 바꿨으면 중단 (덮어쓰기 방지)
      const { count } = await tx.customer.updateMany({
        where: { id: customerId, status: expected },
        data: {
          status: target,
          statusChangedAt: new Date(),
          statusReason: reason,
          endedOn: endedOn ? toDbDate(endedOn) : null,
        },
      });
      if (count === 0) throw new StaleStatus();

      const details: string[] = [];

      if (target === "TRIAL") {
        await tx.trial.create({
          data: {
            customerId,
            startDate: toDbDate(input.trialStart),
            endDate: toDbDate(input.trialEnd),
            qtyHub: n(input.qtyHub),
            qtyBand: n(input.qtyBand),
            qtyCharger: n(input.qtyCharger),
            qtyAdapter: n(input.qtyAdapter),
          },
        });
        details.push(`체험 ${formatDate(input.trialStart)} ~ ${formatDate(input.trialEnd)}`);
      }
      if (target === "NOT_CONVERTED" && expected === "TRIAL") {
        await tx.trial.updateMany({ where: { customerId, result: "IN_PROGRESS" }, data: { result: "NOT_CONVERTED" } });
      }
      if (endedOn) details.push(`${target === "TERMINATED" ? "해지일" : "종료일"} ${formatDate(endedOn)}`);
      if (reason) details.push(`사유: ${reason}`);
      if (incomplete.length) details.push(`미완료 체크리스트: ${summarizeItems(incomplete, 11)}`);

      if (closureType) {
        await createClosure(tx, customerId, closureType);
        details.push(closureType === "NOT_CONVERTED" ? "장비 회수 체크리스트 생성" : "회수·종료 체크리스트 생성");
      }

      await recordHistory(tx, {
        customerId,
        event: "status_changed",
        content: `상태 변경: ${CUSTOMER_STATUS_LABEL[expected]} → ${CUSTOMER_STATUS_LABEL[target]}${details.length ? ` (${details.join(" · ")})` : ""}`,
        data: { from: expected, to: target, reason, endedOn, incomplete },
        actorId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof StaleStatus) {
      const latest = await prisma.customer.findUnique({ where: { id: customerId }, select: { status: true } });
      return {
        ok: false,
        stale: true,
        message: `이미 ${latest ? CUSTOMER_STATUS_LABEL[latest.status] : "다른"} 상태로 변경되었습니다.`,
      };
    }
    throw e;
  }

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

class StaleStatus extends Error {}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// 회수·종료 체크리스트: Closure + 항목 + 기기별 제공 수량 (기능정의서 4-5-2)
// 제공 수량 = 현재 계약 장비 + 추가 제공 기기 + 체험 장비(계약 전환되지 않은 체험) / 옵션상품은 품목별
async function createClosure(tx: Tx, customerId: string, type: "NOT_CONVERTED" | "ENDED" | "TERMINATED") {
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
