"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CustomerStatusBadge } from "@/components/customer-status-badge";
import { DatePicker } from "@/components/date-picker";
import { Field, textareaClass } from "@/components/form";
import type { CustomerStatus } from "@/generated/prisma/enums";
import { addDays, addMonths, diffDays, isDateString } from "@/lib/date";
import { CUSTOMER_STATUS_LABEL, CUSTOMER_STATUSES } from "@/lib/labels";
import {
  emptyTransitionInput,
  missingForStatus,
  summarizeItems,
  TRANSITION_FIELDS,
  transitionInputErrors,
  type MissingItem,
  type StatusFacts,
  type TransitionInput,
} from "@/lib/status-rules";
import { cn } from "@/lib/utils";
import { changeStatus } from "./actions";

// 누락 항목 → 입력하러 가기 위치
export function missingHref(base: string, field: string): string {
  switch (field) {
    case "code":
    case "address":
      return `${base}?tab=info&edit=basic`;
    case "bizName":
    case "bizNo":
    case "bizCeo":
      return `${base}?tab=info&edit=biz`;
    case "billingDay":
    case "paymentMethod":
    case "taxInvoice":
    case "taxInvoiceEmail":
      return `${base}?tab=info&edit=billing`;
    case "serviceUrl":
      return `${base}?tab=info&edit=service`;
    case "accounts":
      return `${base}?tab=info#section-accounts`;
    case "contract":
    case "charges":
      return `${base}?tab=contract`;
    case "contractDoc":
    case "deviceReceiptDoc":
      return `${base}?tab=documents`;
    case "installDate":
      return `${base}?tab=checklist`;
    default:
      return `${base}?tab=info`;
  }
}

// 체험 기간 버튼: 시작일 포함 (10/1 + 2주 → 10/14, 10/1 + 1개월 → 10/31)
const TRIAL_PERIODS: { label: string; end: (start: string) => string }[] = [
  { label: "1주", end: (s) => addDays(s, 6) },
  { label: "2주", end: (s) => addDays(s, 13) },
  { label: "1개월", end: (s) => addDays(addMonths(s, 1), -1) },
];

// 상태별 안내 (기능정의서 1장 상태값 정의)
const DESCRIPTION: Record<CustomerStatus, string> = {
  PENDING: "상담·견적 진행, 계약 전",
  ONBOARDING: "계약 체결 후 설치·세팅 진행 중",
  TRIAL: "무료 체험/PoC (반납 조건)",
  ACTIVE: "정식 서비스 이용 중",
  ENDED: "계약 기간 만료로 종료 — 회수·종료 체크리스트가 생성됩니다",
  TERMINATED: "계약 기간 중 중도 해지 — 회수·종료 체크리스트가 생성됩니다",
  NOT_CONVERTED: "계약으로 이어지지 않음 — 체험중이었다면 장비 회수 체크리스트가 생성됩니다",
  OTHER: "예외",
};

// 상세 헤더의 상태 배지 [상태 ▾] → 상태 변경 모달 (화면정의서 5-1 · 5-2 · 5-3)
export function StatusChanger({
  customerId,
  status,
  facts,
  today,
}: {
  customerId: string;
  status: CustomerStatus;
  facts: StatusFacts;
  today: string;
}) {
  const router = useRouter();
  const base = `/customers/${customerId}`;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<CustomerStatus | null>(null);
  const [input, setInput] = useState<TransitionInput>(emptyTransitionInput());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverMissing, setServerMissing] = useState<MissingItem[] | null>(null);
  const [incomplete, setIncomplete] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setTarget(null);
    setInput(emptyTransitionInput());
    setErrors({});
    setServerMissing(null);
    setIncomplete(null);
  };

  const pick = (s: CustomerStatus) => {
    setTarget(s);
    setErrors({});
    setServerMissing(null);
    // 종료일·해지일은 오늘을 기본값으로
    // 종료일·해지일, 체험 시작일은 오늘을 기본값으로
    setInput({
      ...emptyTransitionInput(),
      endedOn: s === "ENDED" || s === "TERMINATED" ? today : "",
      trialStart: s === "TRIAL" ? today : "",
    });
  };

  // 지금 정보로 판단한 누락 항목 (서버가 최신 기준으로 다시 확인)
  const missing = serverMissing ?? (target ? missingForStatus(target, facts) : []);
  const fields = target ? (TRANSITION_FIELDS[target] ?? []) : [];

  const submit = (confirmIncomplete = false) => {
    if (!target) return;
    const found = transitionInputErrors(target, input);
    setErrors(found);
    if (Object.keys(found).length) return;
    startTransition(async () => {
      const r = await changeStatus(customerId, status, target, input, confirmIncomplete);
      if (r.ok) {
        toast.success(`${CUSTOMER_STATUS_LABEL[target]}(으)로 변경했습니다`);
        setOpen(false);
        reset();
        return;
      }
      if (r.stale) {
        toast.error(r.message ?? "다른 사용자가 상태를 변경했습니다.");
        setOpen(false);
        reset();
        router.refresh();
        return;
      }
      if (r.missing) return setServerMissing(r.missing);
      if (r.incomplete) return setIncomplete(r.incomplete);
      setErrors(r.errors ?? {});
      if (r.message && !r.errors) toast.error(r.message);
    });
  };

  const set = (k: keyof TransitionInput, v: string) => setInput((x) => ({ ...x, [k]: v }));

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        title="상태 변경"
        className="inline-flex items-center gap-0.5 rounded-full hover:opacity-80"
      >
        <CustomerStatusBadge status={status} />
        <ChevronDown className="size-3.5" />
      </button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>상태 변경</DialogTitle>
            <DialogDescription>
              현재 상태: <b>{CUSTOMER_STATUS_LABEL[status]}</b>
            </DialogDescription>
          </DialogHeader>

          {/* 변경할 상태 */}
          <div className="grid grid-cols-2 gap-2">
            {CUSTOMER_STATUSES.filter((s) => s !== status).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                  target === s ? "border-foreground ring-1 ring-foreground" : "hover:bg-muted",
                )}
              >
                <CustomerStatusBadge status={s} />
              </button>
            ))}
          </div>

          {target && (
            <p className="text-xs text-muted-foreground">
              {CUSTOMER_STATUS_LABEL[target]}: {DESCRIPTION[target]}
            </p>
          )}

          {/* 전환 불가 (5-2) */}
          {target && missing.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
              <p className="mb-2 flex items-center gap-1.5 font-medium text-red-800">
                <CircleAlert className="size-4" />
                {CUSTOMER_STATUS_LABEL[target]}(으)로 전환하려면 아래 항목을 먼저 입력하세요.
              </p>
              <ul className="flex flex-col gap-1">
                {missing.map((m) => (
                  <li key={`${m.field}-${m.label}`} className="flex items-center justify-between gap-2">
                    <span className="text-red-900">· {m.label}</span>
                    <Link
                      href={missingHref(base, m.field)}
                      onClick={() => setOpen(false)}
                      className="shrink-0 text-xs text-red-800 underline underline-offset-4"
                    >
                      입력하러 가기
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 상태별 입력 */}
          {target && missing.length === 0 && fields.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {fields.includes("trialStart") && (
                <>
                  <Field label="체험 시작일" required error={errors.trialStart}>
                    <DatePicker value={input.trialStart || undefined} onChange={(v) => set("trialStart", v ?? "")} />
                  </Field>
                  <Field label="체험 종료일" required error={errors.trialEnd}>
                    <DatePicker value={input.trialEnd || undefined} onChange={(v) => set("trialEnd", v ?? "")} />
                  </Field>
                  <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted-foreground">체험 기간</span>
                    {TRIAL_PERIODS.map((p) => {
                      const start = isDateString(input.trialStart) ? input.trialStart : today;
                      const end = p.end(start);
                      const active = input.trialStart === start && input.trialEnd === end;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setInput((x) => ({ ...x, trialStart: start, trialEnd: end }))}
                          className={cn(
                            "rounded-full border px-3 py-0.5 text-xs",
                            active ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                          )}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                    {isDateString(input.trialStart) && isDateString(input.trialEnd) && input.trialEnd >= input.trialStart && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        총 {diffDays(input.trialStart, input.trialEnd) + 1}일
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <span className="text-sm font-medium">
                      체험 장비 수량<span className="ml-0.5 text-destructive">*</span>
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      {(
                        [
                          ["qtyHub", "허브"],
                          ["qtyBand", "밴드"],
                          ["qtyCharger", "충전기"],
                          ["qtyAdapter", "어댑터"],
                        ] as const
                      ).map(([k, label]) => (
                        <label key={k} className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {label}
                          <Input inputMode="numeric" value={input[k]} onChange={(e) => set(k, e.target.value)} placeholder="0" />
                        </label>
                      ))}
                    </div>
                    {errors.trialQty && <span className="text-xs text-destructive">{errors.trialQty}</span>}
                  </div>
                </>
              )}
              {fields.includes("endedOn") && (
                <Field label={target === "TERMINATED" ? "해지일" : "종료일"} required error={errors.endedOn}>
                  <DatePicker value={input.endedOn || undefined} onChange={(v) => set("endedOn", v ?? "")} clearable={false} />
                </Field>
              )}
              {fields.includes("reason") && (
                <Field label="사유" required error={errors.reason} className="col-span-2">
                  <textarea
                    className={textareaClass}
                    rows={3}
                    value={input.reason}
                    onChange={(e) => set("reason", e.target.value)}
                    aria-invalid={!!errors.reason}
                  />
                </Field>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              닫기
            </Button>
            <Button onClick={() => submit()} disabled={!target || missing.length > 0 || pending}>
              {pending && <Loader2 className="animate-spin" />}
              변경
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 사용중 전환 — 체크리스트 미완료 확인 (5-3) */}
      <ConfirmDialog
        open={!!incomplete}
        onOpenChange={(o) => !o && setIncomplete(null)}
        title="체크리스트 미완료"
        description={
          incomplete && `${summarizeItems(incomplete)} 확인이 완료되지 않았습니다. 사용중으로 전환할까요?`
        }
        confirmLabel="전환"
        pending={pending}
        onConfirm={() => {
          setIncomplete(null);
          submit(true);
        }}
      />
    </>
  );
}
