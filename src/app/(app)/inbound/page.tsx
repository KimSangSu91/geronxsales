import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { formatDateTimeKst, todayKst } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { InboxTable, type InquiryRow } from "./inbox-table";
import { SourceFilter } from "./source-filter";

// 인바운드 문의함 (기능정의서 4-11): 미처리 / 제외 탭, 수신 경로별 보기
export default async function InboundPage({ searchParams }: PageProps<"/inbound">) {
  await requireUser();
  const sp = await searchParams;
  const tab = sp.tab === "dismissed" ? "DISMISSED" : "NEW";
  const source = typeof sp.source === "string" ? sp.source : "";
  const sourceWhere: Prisma.InquiryWhereInput = source === "manual" ? { sourceId: null } : source ? { sourceId: source } : {};

  const [rows, counts, sources] = await Promise.all([
    prisma.inquiry.findMany({
      where: { status: tab, ...sourceWhere },
      orderBy: { receivedAt: "desc" },
      include: { source: { select: { name: true } } },
      take: 500,
    }),
    prisma.inquiry.groupBy({ by: ["status"], where: sourceWhere, _count: { _all: true } }),
    prisma.inboundSource.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const handlers = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.handledById).filter((v): v is string => !!v) } },
    select: { id: true, name: true },
  });

  const data: InquiryRow[] = rows.map((q) => ({
    id: q.id,
    channel: q.channel,
    sourceName: q.source?.name ?? null,
    receivedAt: formatDateTimeKst(q.receivedAt),
    receivedOn: todayKst(q.receivedAt),
    facilityName: q.facilityName,
    contactName: q.contactName,
    phone: q.phone,
    email: q.email,
    region: q.region,
    scale: q.scale,
    content: q.content,
    dismissReason: q.dismissReason,
    handledBy: handlers.find((h) => h.id === q.handledById)?.name ?? null,
    handledAt: q.handledAt ? formatDateTimeKst(q.handledAt) : null,
  }));

  const href = (patch: { tab?: string; source?: string }) => {
    const p = new URLSearchParams();
    const t = patch.tab ?? (tab === "DISMISSED" ? "dismissed" : "");
    const s = patch.source ?? source;
    if (t) p.set("tab", t);
    if (s) p.set("source", s);
    const qs = p.toString();
    return qs ? `/inbound?${qs}` : "/inbound";
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">인바운드 문의함</h1>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b">
        <nav className="flex gap-1">
          {[
            { key: "", status: "NEW", label: "미처리" },
            { key: "dismissed", status: "DISMISSED", label: "제외" },
          ].map((t) => (
            <Link
              key={t.key}
              href={href({ tab: t.key })}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                tab === t.status ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} <span className="tabular-nums">{count(t.status)}</span>
            </Link>
          ))}
        </nav>
        <div className="pb-2">
          <SourceFilter value={source} sources={sources} baseHref={href({ source: "" })} />
        </div>
      </div>
      <InboxTable key={`${tab}:${source}`} rows={data} tab={tab} />
    </div>
  );
}
