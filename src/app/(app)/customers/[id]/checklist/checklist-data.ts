import "server-only";
import { formatDateTimeKst, fromDbDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import type { ChecklistView, ClosureView, EntryView } from "./checklist-shared";

type EntryRow = {
  id: string;
  done: boolean;
  doneAt: Date | null;
  doneById: string | null;
  doneBy: { name: string; isActive: boolean } | null;
  item: { code: string; label: string; sortOrder: number };
};

function toEntry(e: EntryRow): EntryView {
  return {
    id: e.id,
    code: e.item.code,
    label: e.item.label,
    done: e.done,
    doneOn: e.doneAt ? formatDateTimeKst(e.doneAt).slice(0, 10) : null,
    // 완료됐는데 완료자가 없으면 엑셀 이관 데이터
    doneBy: !e.done ? null : e.doneBy ? (e.doneBy.isActive ? e.doneBy.name : `(비활성) ${e.doneBy.name}`) : "이관",
  };
}

const entrySelect = {
  id: true,
  done: true,
  doneAt: true,
  doneById: true,
  doneBy: { select: { name: true, isActive: true } },
  item: { select: { code: true, label: true, sortOrder: true } },
} as const;

export async function getChecklistData(customerId: string): Promise<ChecklistView | null> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      version: true,
      installDate: true,
      checklist: {
        where: { closureId: null },
        select: entrySelect,
        orderBy: { item: { sortOrder: "asc" } },
      },
      closures: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          recoveredOn: true,
          completedAt: true,
          createdAt: true,
          entries: { select: entrySelect, orderBy: { item: { sortOrder: "asc" } } },
          recovery: { orderBy: { id: "asc" } },
        },
      },
      accounts: { select: { loginId: true, status: true } },
    },
  });
  if (!c) return null;

  const closures: ClosureView[] = c.closures.map((cl) => ({
    id: cl.id,
    type: cl.type,
    createdOn: formatDateTimeKst(cl.createdAt).slice(0, 10),
    completed: !!cl.completedAt,
    recoveredOn: cl.recoveredOn ? fromDbDate(cl.recoveredOn) : null,
    entries: cl.entries.map(toEntry),
    recovery: cl.recovery
      // 기본 4종은 고정 순서, 옵션상품·기타는 뒤에
      .sort((a, b) => order(a.kind) - order(b.kind))
      .map((l) => ({
        id: l.id,
        kind: l.kind,
        label: l.label,
        providedQty: l.providedQty,
        recoveredQty: l.recoveredQty,
        missingReason: l.missingReason,
      })),
  }));
  // 진행 중인 체크리스트가 위로
  closures.sort((a, b) => Number(a.completed) - Number(b.completed));

  return {
    version: c.version,
    installDate: c.installDate ? fromDbDate(c.installDate) : "",
    onboarding: c.checklist.map(toEntry),
    closures,
    accounts: { total: c.accounts.length, inUse: c.accounts.filter((a) => a.status === "IN_USE").map((a) => a.loginId) },
  };
}

const KIND_ORDER = ["BAND", "HUB", "CHARGER", "ADAPTER", "OTHER"];
const order = (k: string) => KIND_ORDER.indexOf(k);
