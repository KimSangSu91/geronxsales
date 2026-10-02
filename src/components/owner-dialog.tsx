"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field, selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { changeOwner } from "@/app/(app)/customers/owner-actions";

export type OwnerOption = { id: string; name: string };

// 내부 담당자 변경 모달 — 상세(1곳)·목록 일괄(여러 곳) 공용
export function OwnerDialog({
  open,
  onOpenChange,
  targets,
  owners,
  currentOwnerId,
  title,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: { id: string; version?: number }[];
  owners: OwnerOption[];
  currentOwnerId?: string;
  title: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState(currentOwnerId ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Field label="내부 담당자" required>
          <select className={selectClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="" disabled>
              선택
            </option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            취소
          </Button>
          <Button
            disabled={pending || !ownerId || ownerId === currentOwnerId}
            onClick={() =>
              startTransition(async () => {
                const r = await changeOwner(targets, ownerId);
                if (!r.ok) {
                  toast.error(r.message);
                  router.refresh();
                  return;
                }
                toast.success(targets.length > 1 ? `${r.changed}곳의 담당자를 변경했습니다` : "담당자를 변경했습니다");
                onOpenChange(false);
                onDone?.();
                router.refresh();
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            변경
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
