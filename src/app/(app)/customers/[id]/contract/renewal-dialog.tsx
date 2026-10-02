"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/date-picker";
import { Field, textareaClass } from "@/components/form";
import { validateContract, type ContractInput } from "@/lib/contract-input";
import type { FieldErrors } from "@/lib/customer-input";
import { formatDate } from "@/lib/date";
import { contractMonths, renewalPeriod, type BadgeKind } from "@/lib/renewal";
import { ContractForm } from "./contract-card";
import type { ContractView } from "./contract-shared";
import {
  cancelRenewal,
  changeEndDate,
  confirmAutoRenew,
  renewChanged,
  renewSame,
  revertAutoRenew,
  withdrawCancel,
} from "./renewal-actions";

type View = "menu" | "same" | "changed" | "cancel" | "period" | "auto";

const range = (s: string, e: string) => `${formatDate(s)} ~ ${formatDate(e)}`;

// 계약 갱신 모달 (화면정의서 5-4 갱신 확인 · 5-5 계약 기간 변경)
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
  const initialView: View =
    badge === "AUTO_RENEW_UNCONFIRMED" ? "auto" : contract.renewal.cancelled ? "period" : "menu";
  const [view, setView] = useState<View>(initialView);
  const [reason, setReason] = useState("");
  const [endDate, setEndDate] = useState(c.endDate);
  const [form, setForm] = useState<ContractInput>(c);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();

  // 동일 조건 갱신 기간: 계약의 자동연장 기간, 없으면 같은 길이
  const months = Number(c.autoRenewMonths) || contractMonths(c.startDate, c.endDate);
  const next = renewalPeriod(c.endDate, months);

  const close = () => onOpenChange(false);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; errors?: FieldErrors }>, success: string) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(success);
        close();
      } else {
        setErrors(r.errors ?? {});
        setMessage(r.message);
      }
    });

  const goChanged = () => {
    // 변경 있음: 새 기간 + 기존 조건이 채워진 폼 (가입비는 비움 — 한 번만 받는 돈)
    setForm({ ...c, contractDate: today, startDate: next.startDate, endDate: next.endDate, joinFee: "" });
    setErrors({});
    setMessage(undefined);
    setView("changed");
  };

  const title: Record<View, string> = {
    menu: "계약 갱신",
    same: "동일 조건으로 갱신",
    changed: "계약 갱신 (변경 있음)",
    cancel: "계약 갱신 취소",
    period: "계약 기간 변경",
    auto: "자동연장 확인",
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        onOpenChange(o);
        if (o) setView(initialView);
      }}
    >
      <DialogContent className={view === "changed" ? "sm:max-w-2xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>{title[view]}</DialogTitle>
          <DialogDescription>
            현재 계약 {range(c.startDate, c.endDate)}
            {c.autoRenew === "yes" && ` · 자동연장 ${months % 12 === 0 ? `${months / 12}년` : `${months}개월`}`}
          </DialogDescription>
        </DialogHeader>

        {view === "menu" && (
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-auto flex-col gap-1 py-4" onClick={() => setView("same")}>
              계약 갱신 완료
              <span className="text-xs font-normal opacity-80">고객사가 갱신에 동의</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-1 py-4" onClick={() => setView("cancel")}>
              계약 갱신 취소
              <span className="text-xs font-normal text-muted-foreground">종료일에 계약종료</span>
            </Button>
          </div>
        )}

        {view === "same" && (
          <div className="flex flex-col gap-3 text-sm">
            <p>기존 계약과 동일한 조건으로 갱신합니까?</p>
            <div className="rounded-md bg-muted px-3 py-2">
              새 계약 기간 <b>{range(next.startDate, next.endDate)}</b>
              <p className="mt-1 text-xs text-muted-foreground">
                유형·수량·단가·관리비·월 비용은 그대로, 가입비·일시 비용은 옮기지 않습니다.
              </p>
            </div>
          </div>
        )}

        {view === "changed" && (
          <ContractForm form={form} set={(patch) => setForm((f) => ({ ...f, ...patch }))} errors={errors} />
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

        {view === "period" && (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              갱신이 취소되어 종료일에 계약종료됩니다.
              {contract.renewal.cancelReason && <span className="text-muted-foreground"> (사유: {contract.renewal.cancelReason})</span>}
            </p>
            <Field label="종료일" required>
              <DatePicker value={endDate} onChange={(v) => setEndDate(v ?? c.endDate)} clearable={false} />
            </Field>
            <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
              다시 갱신하기로 했다면{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4"
                disabled={pending}
                onClick={() => run(() => withdrawCancel(contract.id), "갱신 취소를 철회했습니다")}
              >
                갱신 취소 철회
              </button>
              → &apos;갱신 확인 필요&apos;로 돌아갑니다.
            </div>
          </div>
        )}

        {view === "auto" && (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              종료일까지 조치가 없어 계약이 동일 조건으로 자동연장되었습니다.
              <br />
              연장 기간: <b>{range(c.startDate, c.endDate)}</b>
            </p>
            <p className="text-xs text-muted-foreground">
              [계약 종료로 변경]을 누르면 자동연장 계약은 취소되고, 이전 계약 종료일로 계약종료 처리됩니다.
            </p>
          </div>
        )}

        <DialogFooter>
          {message && <p className="mr-auto self-center text-sm text-destructive">{message}</p>}
          {view === "same" && (
            <Button variant="outline" onClick={goChanged} disabled={pending}>
              변경 있음
            </Button>
          )}
          {view === "same" && (
            <Button onClick={() => run(() => renewSame(contract.id), "계약을 갱신했습니다")} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              동일 조건으로 갱신
            </Button>
          )}
          {view === "changed" && (
            <Button
              onClick={() => {
                const found = validateContract(form);
                setErrors(found);
                if (Object.keys(found).length) return setMessage("입력 내용을 확인하세요.");
                run(() => renewChanged(contract.id, form), "계약을 갱신했습니다");
              }}
              disabled={pending}
            >
              {pending && <Loader2 className="animate-spin" />}
              새 계약으로 갱신
            </Button>
          )}
          {view === "cancel" && (
            <Button variant="destructive" onClick={() => run(() => cancelRenewal(contract.id, reason), "갱신을 취소했습니다")} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              갱신 취소
            </Button>
          )}
          {view === "period" && (
            <Button onClick={() => run(() => changeEndDate(contract.id, endDate), "종료일을 변경했습니다")} disabled={pending || endDate === c.endDate}>
              {pending && <Loader2 className="animate-spin" />}
              종료일 변경
            </Button>
          )}
          {view === "auto" && (
            <>
              <Button variant="outline" onClick={() => run(() => revertAutoRenew(contract.id), "계약종료로 변경했습니다")} disabled={pending}>
                계약 종료로 변경
              </Button>
              <Button onClick={() => run(() => confirmAutoRenew(contract.id), "자동연장을 승인했습니다")} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                자동연장 승인
              </Button>
            </>
          )}
          {(view === "same" || view === "cancel" || view === "changed") && (
            <Button variant="ghost" onClick={() => setView("menu")} disabled={pending}>
              뒤로
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
