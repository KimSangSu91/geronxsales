"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight, History } from "lucide-react";
import { toast } from "sonner";
import { ActivityForm } from "./activity-form";
import { addActivity, setHistoryPanelCollapsed } from "./actions";
import type { HistoryItem } from "./history-shared";
import { HistoryEntry } from "./history-entry";

// 상세 우측 히스토리 패널 (화면정의서 3-6): 다른 탭을 보면서 기록 입력 + 최근 10건
export function HistoryPanel({
  customerId,
  items,
  today,
  defaultCollapsed,
  historyHref,
}: {
  customerId: string;
  items: HistoryItem[];
  today: string;
  defaultCollapsed: boolean;
  historyHref: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    void setHistoryPanelCollapsed(next); // 사용자별 기억
  };

  if (collapsed) {
    return (
      <aside className="sticky top-20 hidden h-fit shrink-0 lg:block">
        <button
          type="button"
          onClick={toggle}
          title="히스토리 패널 펼치기"
          className="flex flex-col items-center gap-2 rounded-lg border bg-background px-2 py-3 text-xs text-muted-foreground hover:bg-muted"
        >
          <ChevronsLeft className="size-4" />
          <History className="size-4" />
          <span className="[writing-mode:vertical-rl]">히스토리</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-80 shrink-0 flex-col overflow-hidden rounded-lg border bg-background lg:flex">
      <div className="card-head">
        <h2 className="flex items-center gap-1.5">
          <History className="size-4" />
          히스토리
        </h2>
        <button
          type="button"
          onClick={toggle}
          title="히스토리 패널 접기"
          className="-mr-1 rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <ChevronsRight className="size-4" />
        </button>
      </div>

      <div className="border-b px-5 py-4">
        <ActivityForm
          compact
          initial={{ activityType: "", occurredOn: today, content: "" }}
          onSubmit={async (input) => {
            const r = await addActivity(customerId, input);
            if (r.ok) toast.success("기록했습니다");
            return r;
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">최근 기록</p>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">기록이 없습니다</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <HistoryEntry key={item.id} item={item} compact />
            ))}
          </ul>
        )}
      </div>

      <Link href={historyHref} className="border-t px-5 py-3 text-center text-sm text-muted-foreground hover:bg-muted">
        히스토리 탭에서 전체 보기 →
      </Link>
    </aside>
  );
}
