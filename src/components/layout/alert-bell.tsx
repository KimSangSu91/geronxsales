"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertChip } from "@/components/alert-chip";
import { alertHref, type AlertView } from "@/lib/alert-info";
import { cn } from "@/lib/utils";
import { openAlerts } from "@/app/(app)/alert-actions";

// 알림 1행: [배지] 시설명 · 내용 (대시보드와 같은 형태)
export function AlertRowItem({ a, isNew, onClick }: { a: AlertView; isNew?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
      <AlertChip type={a.type} level={a.level} />
      <span className="min-w-0 flex-1 truncate">
        {a.customerName && <b className="font-medium">{a.customerName}</b>}
        {a.customerName && " · "}
        <span className="text-muted-foreground">{a.message}</span>
      </span>
      {isNew && <span className="size-1.5 shrink-0 rounded-full bg-red-500" title="새 알림" />}
    </button>
  );
}

// 상단 🔔 (기능정의서 4-10): 새 알림 점 → 알림 창 → 항목 클릭 시 고객사로
export function AlertBell({ hasNew }: { hasNew: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dot, setDot] = useState(hasNew);
  const [data, setData] = useState<{ alerts: AlertView[]; seenBefore: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        title="알림"
        onClick={() => {
          setOpen(true);
          startTransition(async () => {
            setData(await openAlerts());
            setDot(false);
          });
        }}
        className="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
      >
        <Bell className="size-5" />
        {dot && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500 ring-2 ring-background" />}
        <span className="sr-only">알림</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>알림</DialogTitle>
            <DialogDescription>{data ? `처리할 알림 ${data.alerts.length}건 · 심각도순` : "알림을 불러오는 중…"}</DialogDescription>
          </DialogHeader>
          <div className={cn("-mx-2 max-h-[60vh] overflow-y-auto", pending && !data && "flex justify-center py-8")}>
            {!data ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : data.alerts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">처리할 알림이 없습니다</p>
            ) : (
              data.alerts.map((a) => (
                <AlertRowItem
                  key={a.id}
                  a={a}
                  isNew={!data.seenBefore || a.createdAt > data.seenBefore}
                  onClick={() => {
                    setOpen(false);
                    router.push(alertHref(a));
                  }}
                />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
