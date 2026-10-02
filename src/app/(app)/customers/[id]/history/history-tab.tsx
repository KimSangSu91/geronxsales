"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { selectClass } from "@/components/form";
import { formatDate } from "@/lib/date";
import { ACTIVITY_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ActivityForm } from "./activity-form";
import { addActivity } from "./actions";
import { HISTORY_PAGE, type HistoryFilters, type HistoryItem } from "./history-shared";
import { HistoryEntry } from "./history-entry";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (d: string) => `${formatDate(d)} (${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]})`;

// 히스토리 탭 (화면정의서 4-7): 입력 폼 + 필터 + 날짜별 타임라인
export function HistoryTab({
  customerId,
  basePath,
  items,
  total,
  filters,
  users,
  today,
}: {
  customerId: string;
  basePath: string; // /customers/{id}
  items: HistoryItem[];
  total: number;
  filters: HistoryFilters;
  users: { id: string; name: string; isActive: boolean }[];
  today: string;
}) {
  const router = useRouter();

  const href = (patch: Partial<HistoryFilters>) => {
    const f = { ...filters, ...patch };
    const sp = new URLSearchParams({ tab: "history" });
    if (f.kind) sp.set("hkind", f.kind);
    if (f.type) sp.set("htype", f.type);
    if (f.from) sp.set("hfrom", f.from);
    if (f.to) sp.set("hto", f.to);
    if (f.author) sp.set("hauthor", f.author);
    if (f.limit > HISTORY_PAGE) sp.set("hlimit", String(f.limit));
    return `${basePath}?${sp}`;
  };
  // 필터를 바꾸면 처음 50건부터
  const go = (patch: Partial<HistoryFilters>) => router.push(href({ ...patch, limit: HISTORY_PAGE }), { scroll: false });
  const filtered = !!(filters.kind || filters.type || filters.from || filters.to || filters.author);

  // 날짜별 묶음 (최신순 유지)
  const groups: { day: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.day === item.occurredOn) last.items.push(item);
    else groups.push({ day: item.occurredOn, items: [item] });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border bg-background">
        <div className="card-head">
          <h3>기록 남기기</h3>
        </div>
        <div className="px-5 py-4">
          <ActivityForm
            rows={4}
            initial={{ activityType: "", occurredOn: today, content: "" }}
            onSubmit={async (input) => {
              const r = await addActivity(customerId, input);
              if (r.ok) toast.success("기록했습니다");
              return r;
            }}
          />
        </div>
      </section>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-lg border p-0.5">
          {([undefined, "AUTO", "MANUAL"] as const).map((k) => (
            <button
              key={k ?? "all"}
              type="button"
              onClick={() => go({ kind: k, type: k === "AUTO" ? undefined : filters.type })}
              className={cn(
                "rounded-md px-3 py-1",
                filters.kind === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {k === "AUTO" ? "자동" : k === "MANUAL" ? "수동" : "전체"}
            </button>
          ))}
        </div>
        <select
          className={cn(selectClass, "w-32")}
          value={filters.type ?? ""}
          disabled={filters.kind === "AUTO"}
          onChange={(e) => go({ type: (e.target.value || undefined) as HistoryFilters["type"] })}
          aria-label="활동 유형"
        >
          <option value="">유형 전체</option>
          {Object.entries(ACTIVITY_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <DatePicker className="w-40" value={filters.from} onChange={(v) => go({ from: v })} placeholder="시작일" />
        <span className="text-muted-foreground">~</span>
        <DatePicker className="w-40" value={filters.to} onChange={(v) => go({ to: v })} placeholder="종료일" />
        <select
          className={cn(selectClass, "w-40")}
          value={filters.author ?? ""}
          onChange={(e) => go({ author: e.target.value || undefined })}
          aria-label="작성자"
        >
          <option value="">작성자 전체</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.isActive ? u.name : `(비활성) ${u.name}`}
            </option>
          ))}
          <option value="system">시스템·이관</option>
        </select>
        {filtered && (
          <Link
            href={`${basePath}?tab=history`}
            scroll={false}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            필터 초기화
          </Link>
        )}
        <span className="ml-auto text-xs text-muted-foreground">총 {total}건</span>
      </div>

      {/* 타임라인 */}
      <section className="rounded-lg border bg-background px-5 py-4">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {filtered ? "조건에 맞는 기록이 없습니다" : "기록이 없습니다"}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.day}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">{dayLabel(g.day)}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <ul className="flex flex-col gap-3.5">
                  {g.items.map((item) => (
                    <HistoryEntry key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {items.length < total && (
          <div className="mt-5 text-center">
            <Link
              href={href({ limit: filters.limit + HISTORY_PAGE })}
              scroll={false}
              className="inline-block rounded-md border px-4 py-1.5 text-sm hover:bg-muted"
            >
              더 보기 ({total - items.length}건 남음)
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
