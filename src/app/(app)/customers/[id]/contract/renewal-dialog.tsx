"use client";

import { useState, useTransition } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/date-picker";
import { Field, textareaClass } from "@/components/form";
import type { FieldErrors } from "@/lib/customer-input";
import { dDayLabel, formatDate } from "@/lib/date";
import { extendEnd, type BadgeKind } from "@/lib/renewal";
import { cn } from "@/lib/utils";
import type { ContractView } from "./contract-shared";
import { cancelRenewal, confirmAutoRenew, revertAutoRenew, setContractEnd, withdrawCancel } from "./renewal-actions";

const PRESETS = [
  { label: "+6개월", months: 6 },
  { label: "+1년", months: 12 },
  { label: "+2년", months: 24 },
];

// 계약 갱신 모달 (화면정의서 5-4·5-5) — 갱신 = 현재 계약의 종료일 변경
export function RenewalDialog({
  contract,
  badge,
  open,
  onOpenChange,
  today,
}: {
  contract: ContractView;
  badge: BadgeKind | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
}) {
  const c = contract.input;
  const r = contract.renewal;
  const [view, setView] = useState<"main" | "cancel">("main");
  const [endDate, setEndDate] = useState(c.endDate);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setView("main");
    setEndDate(c.endDate);
    setReason("");
    setErrors({});
    setMessage(undefined);
  };

  const run = (fn: () => Promise<{ ok: boolean; message?: string; errors?: FieldErrors }>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(success);
        onOpenChange(false);
      } else {
        setErrors(res.errors ?? {});
        setMessage(res.message);
      }
    });

  const changed = endDate !== c.endDate;
  const extending = endDate > c.endDate;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        onOpenChange(o);
        if (o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{view === "cancel" ? "계약 갱신 취소" : "계약 갱신 · 종료일 변경"}</DialogTitle>
          <DialogDescription>
            현재 계약 {formatDate(c.startDate)} ~ {formatDate(c.endDate)} ({dDayLabel(c.endDate, today)})
          </DialogDescription>
        </DialogHeader>

        {view === "main" && (
          <div className="flex flex-col gap-4 text-sm">
            {/* 자동연장 미승인 */}
            {badge === "AUTO_RENEW_UNCONFIRMED" && r.autoRenewedFrom && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <p className="text-red-800">
                  종료일까지 조치가 없어 자동연장되었습니다: 종료일 <b>{formatDate(r.autoRenewedFrom)}</b> →{" "}
                  <b>{formatDate(c.endDate)}</b>
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => revertAutoRenew(contract.id), "계약종료로 변경했습니다")}
                  >
                    계약 종료로 변경
                  </Button>
                  <Button size="sm" disabled={pending} onClick={() => run(() => confirmAutoRenew(contract.id), "자동연장을 승인했습니다")}>
                    자동연장 승인
                  </Button>
                </div>
              </div>
            )}

            {/* 갱신 취소 상태 */}
            {r.cancelled && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p>
                  갱신이 취소되어 종료일(<b>{formatDate(c.endDate)}</b>)에 계약종료됩니다.
                  {r.cancelReason && <span className="text-muted-foreground"> 사유: {r.cancelReason}</span>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  다시 갱신하기로 했다면{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-4"
                    disabled={pending}
                    onClick={() => run(() => withdrawCancel(contract.id), "갱신 취소를 철회했습니다")}
                  >
                    갱신 취소 철회
                  </button>{" "}
                  후 종료일을 늘리세요.
                </p>
              </div>
            )}

            {/* 종료일 변경 (갱신) */}
            <Field label={r.cancelled ? "계약 종료일" : "새 종료일"} required>
              {!r.cancelled && (
                <div className="flex flex-wrap gap-1">
                  {PRESETS.map((p) => {
                    const v = extendEnd(c.endDate, p.months);
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setEndDate(v)}
                        className={cn(
                          "rounded-full border px-3 py-0.5 text-xs",
                          endDate === v ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                  {r.lastRenewedFrom && (
                    <button
                      type="button"
                      onClick={() => setEndDate(r.lastRenewedFrom!)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs",
                        endDate === r.lastRenewedFrom ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                      )}
                    >
                      <Undo2 className="size-3" />
                      직전 갱신 되돌리기 ({formatDate(r.lastRenewedFrom)})
                    </button>
                  )}
                </div>
              )}
              <DatePicker value={endDate} onChange={(v) => setEndDate(v ?? c.endDate)} clearable={false} />
              <span className="text-xs text-muted-foreground">
                {changed ? (
                  <>
                    종료일 {formatDate(c.endDate)} → <b className="text-foreground">{formatDate(endDate)}</b>
                    {extending ? " (갱신)" : " (줄이기 — 갱신했다가 취소된 경우 등)"}
                  </>
                ) : (
                  "버튼(현재 종료일 기준)이나 날짜로 새 종료일을 정하세요. 시작일·금액 조건은 그대로입니다."
                )}
              </span>
            </Field>
          </div>
        )}

        {view === "cancel" && (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              갱신하지 않고 <b>{formatDate(c.endDate)}</b>에 계약을 종료합니다. 종료일이 지나면 자동으로 계약종료로 바뀌고
              회수·종료 체크리스트가 만들어집니다.
            </p>
            <Field label="취소 사유" required error={errors.reason}>
              <textarea className={textareaClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        )}

        <DialogFooter>
          {message && <p className="mr-auto self-center text-sm text-destructive">{message}</p>}
          {view === "main" && !r.cancelled && (
            <Button variant="ghost" className="mr-auto" onClick={() => setView("cancel")} disabled={pending}>
              갱신하지 않음 (갱신 취소)
            </Button>
          )}
          {view === "main" && (
            <Button
              onClick={() =>
                run(() => setContractEnd(contract.id, endDate), extending ? "계약을 갱신했습니다" : "종료일을 변경했습니다")
              }
              disabled={pending || !changed}
            >
              {pending && <Loader2 className="animate-spin" />}
              {extending ? "갱신" : "종료일 변경"}
            </Button>
          )}
          {view === "cancel" && (
            <>
              <Button variant="ghost" onClick={() => setView("main")} disabled={pending}>
                뒤로
              </Button>
              <Button variant="destructive" onClick={() => run(() => cancelRenewal(contract.id, reason), "갱신을 취소했습니다")} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                갱신 취소
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
