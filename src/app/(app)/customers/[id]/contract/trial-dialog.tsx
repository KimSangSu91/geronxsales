"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/date-picker";
import { Field, textareaClass } from "@/components/form";
import { emptyContract, validateContract, type ContractInput } from "@/lib/contract-input";
import type { FieldErrors } from "@/lib/customer-input";
import { addDays, addMonths, formatDate } from "@/lib/date";
import { emptyTransitionInput, type MissingItem } from "@/lib/status-rules";
import { changeStatus } from "../status/actions";
import { missingHref } from "../status/status-changer";
import { ContractForm } from "./contract-card";
import type { ContractTabData } from "./contract-shared";
import { convertTrial, extendTrial } from "./trial-actions";

type Trial = NonNullable<ContractTabData["trial"]>;
type View = "menu" | "convert" | "extend" | "notConverted" | "missing";

// 체험 결과 처리 모달 (화면정의서 5-8): [계약 전환] [체험 연장] [미전환 처리]
export function TrialDialog({
  customerId,
  trial,
  hasContract,
  open,
  onOpenChange,
  today,
}: {
  customerId: string;
  trial: Trial;
  hasContract: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
}) {
  const [view, setView] = useState<View>("menu");
  const [carry, setCarry] = useState(true);
  const [form, setForm] = useState<ContractInput>(emptyContract());
  const [newEnd, setNewEnd] = useState("");
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const base = `/customers/${customerId}`;
  const overdue = trial.endDate < today;

  // 체험 장비를 계약 장비로 (체크 시 수량 채움)
  const carried = (on: boolean, f: ContractInput): ContractInput =>
    on
      ? { ...f, qtyHub: String(trial.qtyHub || ""), qtyBand: String(trial.qtyBand || ""), qtyCharger: String(trial.qtyCharger || "") }
      : { ...f, qtyHub: "", qtyBand: "", qtyCharger: "" };

  const goConvert = () => {
    const start = addDays(trial.endDate, 1) > today ? addDays(trial.endDate, 1) : today;
    setForm(
      carried(carry, {
        ...emptyContract(),
        contractDate: today,
        startDate: start,
        endDate: addDays(addMonths(start, 12), -1),
        purchaseBillingMonth: start.slice(0, 7),
      }),
    );
    setErrors({});
    setMessage(undefined);
    setView("convert");
  };

  const reset = () => {
    setView("menu");
    setErrors({});
    setMessage(undefined);
  };

  const submitConvert = () => {
    if (!hasContract) {
      const found = validateContract(form);
      setErrors(found);
      if (Object.keys(found).length) return setMessage("입력 내용을 확인하세요.");
    }
    startTransition(async () => {
      const r = await convertTrial(customerId, form);
      if (!r.ok) {
        setErrors(r.errors ?? {});
        setMessage(r.message);
        return;
      }
      if (r.converted) {
        toast.success("계약 전환: 도입준비로 변경했습니다");
        onOpenChange(false);
        return;
      }
      toast.success("계약을 저장했습니다");
      setMissing(r.missing ?? []);
      setMessage(r.message);
      setView("missing");
    });
  };

  const submitExtend = () =>
    startTransition(async () => {
      const r = await extendTrial(trial.id, newEnd);
      if (r.ok) {
        toast.success("체험을 연장했습니다");
        onOpenChange(false);
      } else setMessage(r.message);
    });

  const submitNotConverted = () => {
    if (!reason.trim()) return setErrors({ reason: "사유를 입력하세요." });
    startTransition(async () => {
      const r = await changeStatus(customerId, "TRIAL", "NOT_CONVERTED", { ...emptyTransitionInput(), reason });
      if (r.ok) {
        toast.success("미전환 처리했습니다 · 장비 회수 체크리스트가 만들어졌습니다");
        onOpenChange(false);
      } else setMessage(r.message ?? "처리하지 못했습니다.");
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        onOpenChange(o);
        if (o) reset();
      }}
    >
      <DialogContent className={view === "convert" ? "sm:max-w-2xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>체험 결과 처리</DialogTitle>
          <DialogDescription>
            {overdue ? "체험 기간이 경과했습니다" : `체험이 ${formatDate(trial.endDate)}에 종료됩니다`} (체험{" "}
            {formatDate(trial.startDate)} ~ {formatDate(trial.endDate)}). 체험 결과를 선택하세요.
          </DialogDescription>
        </DialogHeader>

        {view === "menu" && (
          <div className="grid grid-cols-3 gap-2">
            <Button className="h-auto flex-col gap-1 py-4" onClick={goConvert}>
              계약 전환
              <span className="text-xs font-normal opacity-80">→ 도입준비</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-1 py-4"
              onClick={() => {
                setNewEnd(addDays(trial.endDate < today ? today : trial.endDate, 14));
                setView("extend");
              }}
            >
              체험 연장
              <span className="text-xs font-normal text-muted-foreground">종료일 변경</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-1 py-4" onClick={() => setView("notConverted")}>
              미전환 처리
              <span className="text-xs font-normal text-muted-foreground">장비 회수</span>
            </Button>
          </div>
        )}

        {view === "convert" &&
          (hasContract ? (
            <p className="text-sm">이미 등록된 계약이 있습니다. 도입준비로 전환합니다.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={carry}
                  onChange={(e) => {
                    setCarry(e.target.checked);
                    setForm((f) => carried(e.target.checked, f));
                  }}
                />
                체험 장비를 계약 장비로 (허브 {trial.qtyHub} · 밴드 {trial.qtyBand} · 충전기 {trial.qtyCharger})
              </label>
              <ContractForm form={form} set={(patch) => setForm((f) => ({ ...f, ...patch }))} errors={errors} />
            </div>
          ))}

        {view === "extend" && (
          <Field label="새 체험 종료일" required>
            <DatePicker value={newEnd || undefined} onChange={(v) => setNewEnd(v ?? "")} clearable={false} />
            <span className="flex gap-1">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setNewEnd(addDays(trial.endDate < today ? today : trial.endDate, d))}
                  className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                >
                  +{d}일
                </button>
              ))}
            </span>
          </Field>
        )}

        {view === "notConverted" && (
          <div className="flex flex-col gap-2 text-sm">
            <p>상태를 미전환으로 바꾸고 장비 회수 체크리스트를 만듭니다.</p>
            <Field label="사유" required error={errors.reason}>
              <textarea className={textareaClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        )}

        {view === "missing" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            <p className="mb-2 flex items-center gap-1.5 font-medium text-red-800">
              <CircleAlert className="size-4" />
              계약은 저장했습니다. 도입준비로 전환하려면 아래 항목을 먼저 입력하세요.
            </p>
            <ul className="flex flex-col gap-1">
              {missing.map((m) => (
                <li key={`${m.field}-${m.label}`} className="flex items-center justify-between gap-2">
                  <span className="text-red-900">· {m.label}</span>
                  <Link href={missingHref(base, m.field)} onClick={() => onOpenChange(false)} className="shrink-0 text-xs text-red-800 underline underline-offset-4">
                    입력하러 가기
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-red-800">입력 후 상단 상태 배지에서 도입준비로 바꾸면 됩니다.</p>
          </div>
        )}

        <DialogFooter>
          {message && <p className="mr-auto self-center text-sm text-destructive">{message}</p>}
          {view !== "menu" && view !== "missing" && (
            <Button variant="ghost" onClick={reset} disabled={pending}>
              뒤로
            </Button>
          )}
          {view === "convert" && (
            <Button onClick={submitConvert} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {hasContract ? "도입준비로 전환" : "계약 등록 후 도입준비로 전환"}
            </Button>
          )}
          {view === "extend" && (
            <Button onClick={submitExtend} disabled={pending || !newEnd}>
              {pending && <Loader2 className="animate-spin" />}
              연장
            </Button>
          )}
          {view === "notConverted" && (
            <Button variant="destructive" onClick={submitNotConverted} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              미전환 처리
            </Button>
          )}
          {view === "missing" && <Button onClick={() => onOpenChange(false)}>닫기</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
