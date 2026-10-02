"use client";

import { useState, useTransition } from "react";
import { Circle, PenLine, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatDate } from "@/lib/date";
import { ACTIVITY_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ActivityForm } from "./activity-form";
import { deleteActivity, updateActivity } from "./actions";
import type { HistoryItem } from "./history-shared";

// 히스토리 1건: 자동(●)·수동(✎), 본인 수동 기록만 [수정]·[삭제]
export function HistoryEntry({ item, compact }: { item: HistoryItem; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();
  const manual = item.kind === "MANUAL";

  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 shrink-0">
        {manual ? (
          <PenLine className="size-4 text-sky-600" aria-label="수동 기록" />
        ) : (
          <Circle className="size-2.5 translate-x-[3px] translate-y-1 fill-muted-foreground/50 text-muted-foreground/50" aria-label="자동 기록" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          {manual && item.activityType && (
            <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">
              {ACTIVITY_TYPE_LABEL[item.activityType]}
            </span>
          )}
          {compact && <span className="tabular-nums">{formatDate(item.occurredOn)}</span>}
          {/* 자동 기록은 처리 시각 표시 (수동 기록은 사용자가 고른 날짜만) */}
          {!manual && <span className="tabular-nums">{item.createdAt.slice(11)}</span>}
          <span>· {item.author}</span>
          {item.edited && <span>· 수정됨</span>}
          {item.mine && !editing && (
            <span className="ml-auto flex">
              <Button variant="ghost" size="icon-xs" title="수정" onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-xs" title="삭제" onClick={() => setDeleting(true)}>
                <Trash2 />
              </Button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-2">
            <ActivityForm
              compact={compact}
              rows={compact ? 3 : 4}
              submitLabel="저장"
              resetAfterSubmit={false}
              initial={{ activityType: item.activityType ?? "", occurredOn: item.occurredOn, content: item.content }}
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                const r = await updateActivity(item.id, input);
                if (r.ok) {
                  setEditing(false);
                  toast.success("기록을 수정했습니다");
                }
                return r;
              }}
            />
          </div>
        ) : (
          <p className={cn("mt-0.5 text-sm break-words whitespace-pre-wrap", compact && "line-clamp-4")}>
            {item.content}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="기록 삭제"
        description="이 기록을 삭제합니다. 복구할 수 없으며, 삭제한 사실은 히스토리에 남습니다."
        confirmLabel="삭제"
        destructive
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const r = await deleteActivity(item.id);
            setDeleting(false);
            if (r.ok) toast.success("기록을 삭제했습니다");
            else toast.error(r.message ?? "삭제하지 못했습니다.");
          })
        }
      />
    </li>
  );
}
