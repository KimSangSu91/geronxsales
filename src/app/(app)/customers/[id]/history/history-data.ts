import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityType } from "@/generated/prisma/enums";
import { formatDateTimeKst, fromDbDate, isDateString, toDbDate } from "@/lib/date";
import { ACTIVITY_TYPE_LABEL } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { HISTORY_PAGE, type HistoryFilters, type HistoryItem } from "./history-shared";

const select = {
  id: true,
  kind: true,
  event: true,
  activityType: true,
  occurredOn: true,
  createdAt: true,
  content: true,
  actorId: true,
  editedAt: true,
  actor: { select: { name: true, isActive: true } },
} satisfies Prisma.HistorySelect;

type Row = Prisma.HistoryGetPayload<{ select: typeof select }>;

function toItem(h: Row, userId: string): HistoryItem {
  const author = h.actor
    ? h.actor.isActive
      ? h.actor.name
      : `(비활성) ${h.actor.name}`
    : h.kind === "MANUAL" || h.event === "migrated"
      ? "이관"
      : "시스템";
  return {
    id: h.id,
    kind: h.kind,
    activityType: h.activityType,
    occurredOn: fromDbDate(h.occurredOn),
    createdAt: formatDateTimeKst(h.createdAt),
    content: h.content,
    author,
    mine: h.kind === "MANUAL" && h.actorId === userId,
    edited: !!h.editedAt,
  };
}

// 최신순: 활동 날짜 → 기록 시각
const orderBy: Prisma.HistoryOrderByWithRelationInput[] = [{ occurredOn: "desc" }, { createdAt: "desc" }];

// 우측 패널: 최근 기록 10건
export async function getRecentHistory(customerId: string, userId: string) {
  const rows = await prisma.history.findMany({ where: { customerId }, orderBy, take: 10, select });
  return rows.map((h) => toItem(h, userId));
}

// ───────── 히스토리 탭: 필터 (URL 쿼리 h* ) ─────────

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseHistoryFilters(raw: Raw): HistoryFilters {
  const kind = one(raw.hkind);
  const type = one(raw.htype);
  const from = one(raw.hfrom);
  const to = one(raw.hto);
  const limit = Number(one(raw.hlimit));
  return {
    kind: kind === "AUTO" || kind === "MANUAL" ? kind : undefined,
    type: type && Object.hasOwn(ACTIVITY_TYPE_LABEL, type) ? (type as ActivityType) : undefined,
    from: from && isDateString(from) ? from : undefined,
    to: to && isDateString(to) ? to : undefined,
    author: (() => {
      const a = one(raw.hauthor);
      return a === "system" || (a && /^[0-9a-f-]{36}$/i.test(a)) ? a : undefined;
    })(),
    limit: Number.isInteger(limit) && limit > HISTORY_PAGE ? Math.min(limit, 1000) : HISTORY_PAGE,
  };
}

export async function getHistoryPage(customerId: string, userId: string, f: HistoryFilters) {
  const where: Prisma.HistoryWhereInput = {
    customerId,
    ...(f.kind && { kind: f.kind }),
    ...(f.type && { activityType: f.type }),
    ...((f.from || f.to) && {
      occurredOn: { ...(f.from && { gte: toDbDate(f.from) }), ...(f.to && { lte: toDbDate(f.to) }) },
    }),
    ...(f.author && { actorId: f.author === "system" ? null : f.author }),
  };
  const [rows, total] = await Promise.all([
    prisma.history.findMany({ where, orderBy, take: f.limit, select }),
    prisma.history.count({ where }),
  ]);
  return { items: rows.map((h) => toItem(h, userId)), total };
}
