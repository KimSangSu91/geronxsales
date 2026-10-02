"use client";

import { useState, useTransition } from "react";
import { FileText, Loader2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConflictDialog } from "@/components/conflict-dialog";
import { DatePicker } from "@/components/date-picker";
import { Field, selectClass, textareaClass } from "@/components/form";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { emptyContract, validateContract, type ContractInput } from "@/lib/contract-input";
import type { FieldErrors } from "@/lib/customer-input";
import { addDays, addMonths, dDayLabel, formatDate } from "@/lib/date";
import { BILLING_TIMING_LABEL } from "@/lib/labels";
import { createContract, updateContract, type Conflict } from "./actions";
import type { ContractView } from "./contract-shared";

const LABELS: Partial<Record<keyof ContractInput, string>> = {
  contractDate: "계약일",
  startDate: "시작일",
  endDate: "종료일",
  contractUsers: "계약 인원",
  billingTiming: "선불/후불",
  autoRenew: "자동연장",
  qtyHub: "허브",
  qtyBand: "밴드",
  qtyCharger: "충전기",
  qtyAdapter: "어댑터",
  memo: "메모",
};
const show = (k: keyof ContractInput, v: unknown) => {
  const s = String(v ?? "");
  if (!s) return "-";
  if (k === "contractDate" || k === "startDate" || k === "endDate") return formatDate(s);
  if (k === "billingTiming") return BILLING_TIMING_LABEL[s as "PREPAID"];
  if (k === "autoRenew") return s === "yes" ? "Y" : "N";
  return s;
};

const QTY = [
  ["qtyHub", "허브"],
  ["qtyBand", "밴드"],
  ["qtyCharger", "충전기"],
  ["qtyAdapter", "어댑터"],
] as const;

// 계약 기간 버튼: 시작일 포함 1년 (5/28 → 다음 해 5/27)
const PERIODS = [
  { label: "1년", months: 12 },
  { label: "2년", months: 24 },
];

export function ContractSummary({ contract, today }: { contract: ContractView; today: string }) {
  const c = contract.input;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
      <div className="flex gap-3">
        <dt className="w-20 shrink-0 text-muted-foreground">계약일</dt>
        <dd className="tabular-nums">{formatDate(c.contractDate)}</dd>
      </div>
      <div className="flex gap-3 md:col-span-2">
        <dt className="w-20 shrink-0 text-muted-foreground">기간</dt>
        <dd className="tabular-nums">
          {formatDate(c.startDate)} ~ {formatDate(c.endDate)}{" "}
          {contract.state === "CURRENT" && <span className="text-xs text-muted-foreground">({dDayLabel(c.endDate, today)})</span>}
        </dd>
      </div>
      <div className="flex gap-3">
        <dt className="w-20 shrink-0 text-muted-foreground">계약 인원</dt>
        <dd>{c.contractUsers}명</dd>
      </div>
      <div className="flex gap-3">
        <dt className="w-20 shrink-0 text-muted-foreground">선불/후불</dt>
        <dd>{BILLING_TIMING_LABEL[c.billingTiming]}</dd>
      </div>
      <div className="flex gap-3">
        <dt className="w-20 shrink-0 text-muted-foreground">자동연장</dt>
        <dd>{c.autoRenew === "yes" ? "Y" : "N"}</dd>
      </div>
      <div className="flex gap-3 md:col-span-3">
        <dt className="w-20 shrink-0 text-muted-foreground">계약 장비</dt>
        <dd className="tabular-nums">{QTY.map(([k, l]) => `${l} ${c[k] || 0}`).join(" · ")}</dd>
      </div>
      {c.memo && (
        <div className="flex gap-3 md:col-span-3">
          <dt className="w-20 shrink-0 text-muted-foreground">메모</dt>
          <dd className="whitespace-pre-wrap">{c.memo}</dd>
        </div>
      )}
    </dl>
  );
}

export function ContractCard({
  customerId,
  contract,
  excelNote,
  today,
}: {
  customerId: string;
  contract: ContractView | null;
  excelNote: string | null;
  today: string;
}) {
  const [editing, setEditing] = useState<{ version?: number; base: ContractInput } | null>(null);
  const [form, setForm] = useState<ContractInput>(emptyContract());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<Conflict<ContractInput> | null>(null);
  const [pending, startTransition] = useTransition();

  useUnsavedChanges("contract", !!editing && JSON.stringify(form) !== JSON.stringify(editing.base));

  const open = () => {
    const base = contract ? contract.input : { ...emptyContract(), contractDate: today, startDate: today };
    setEditing({ version: contract?.version, base });
    setForm(base);
    setErrors({});
    setMessage(undefined);
  };

  const save = () => {
    const found = validateContract(form);
    setErrors(found);
    if (Object.keys(found).length) return setMessage("입력 내용을 확인하세요.");
    startTransition(async () => {
      const r = contract ? await updateContract(contract.id, editing!.version!, form) : await createContract(customerId, form);
      if (r.ok) {
        setEditing(null);
        toast.success(contract ? "계약을 수정했습니다" : "계약을 등록했습니다");
        return;
      }
      if (r.conflict) return setConflict(r.conflict as Conflict<ContractInput>);
      setErrors(r.errors ?? {});
      setMessage(r.message);
    });
  };

  const set = (k: keyof ContractInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <section className="rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="font-semibold">현재 계약</h3>
        <div className="flex gap-1">
          {contract && (
            <Button variant="ghost" size="sm" onClick={open}>
              <Pencil />
              수정
            </Button>
          )}
          {/* 계약 갱신은 다음 작업(갱신)에서 연결 */}
          <Button variant="ghost" size="sm" disabled title="계약 갱신은 다음 작업에서 구현">
            <RefreshCw />
            계약 갱신
          </Button>
        </div>
      </div>
      <div className="px-5 py-4">
        {contract ? (
          <ContractSummary contract={contract} today={today} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
            <FileText className="size-6" />
            <p>등록된 계약이 없습니다</p>
            {excelNote && <p className="rounded-md bg-muted px-3 py-1.5 text-xs">엑셀 이관 정보: {excelNote}</p>}
            <Button onClick={open}>계약 등록</Button>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && !pending && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{contract ? "계약 수정" : "계약 등록"}</DialogTitle>
          </DialogHeader>
          {!contract && excelNote && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">참고 · 엑셀 이관 정보: {excelNote}</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="계약일" required error={errors.contractDate}>
              <DatePicker value={form.contractDate || undefined} onChange={(v) => set("contractDate", v ?? "")} />
            </Field>
            <Field label="시작일" required error={errors.startDate}>
              <DatePicker value={form.startDate || undefined} onChange={(v) => set("startDate", v ?? "")} />
            </Field>
            <Field label="종료일" required error={errors.endDate}>
              <DatePicker value={form.endDate || undefined} onChange={(v) => set("endDate", v ?? "")} />
            </Field>
            <div className="flex items-center gap-1.5 sm:col-span-3">
              <span className="text-xs text-muted-foreground">기간</span>
              {PERIODS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={!form.startDate}
                  onClick={() => set("endDate", addDays(addMonths(form.startDate, p.months), -1))}
                  className="rounded-full border px-3 py-0.5 text-xs hover:bg-muted disabled:opacity-40"
                >
                  시작일부터 {p.label}
                </button>
              ))}
            </div>
            <Field label="계약 인원" required error={errors.contractUsers}>
              <Input inputMode="numeric" value={form.contractUsers} onChange={(e) => set("contractUsers", e.target.value)} placeholder="명" aria-invalid={!!errors.contractUsers} />
            </Field>
            <Field label="선불/후불" required error={errors.billingTiming}>
              <select className={selectClass} value={form.billingTiming} onChange={(e) => set("billingTiming", e.target.value)}>
                {Object.entries(BILLING_TIMING_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="자동연장" required error={errors.autoRenew}>
              <select className={selectClass} value={form.autoRenew} onChange={(e) => set("autoRenew", e.target.value)}>
                <option value="yes">Y (자동연장)</option>
                <option value="no">N</option>
              </select>
            </Field>
            <div className="flex flex-col gap-1.5 sm:col-span-3">
              <span className="text-sm font-medium">계약 장비 수량</span>
              <div className="grid grid-cols-4 gap-2">
                {QTY.map(([k, l]) => (
                  <label key={k} className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {l}
                    <Input inputMode="numeric" value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder="0" aria-invalid={!!errors[k]} />
                  </label>
                ))}
              </div>
            </div>
            <Field label="메모" className="sm:col-span-3">
              <textarea className={textareaClass} rows={2} value={form.memo} onChange={(e) => set("memo", e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            {message && <p className="mr-auto self-center text-sm text-destructive">{message}</p>}
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              취소
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConflictDialog
        conflict={conflict}
        rows={
          conflict && editing
            ? (Object.keys(LABELS) as (keyof ContractInput)[])
                .filter((k) => String(conflict.latest[k]) !== String(editing.base[k]))
                .map((k) => ({ label: LABELS[k]!, latest: show(k, conflict.latest[k]), mine: show(k, form[k]) }))
            : []
        }
        onCancel={() => {
          setConflict(null);
          setEditing(null);
        }}
        onReedit={() => {
          if (!conflict) return;
          setEditing({ version: conflict.version, base: conflict.latest });
          setForm(conflict.latest);
          setErrors({});
          setMessage(undefined);
          setConflict(null);
        }}
      />
    </section>
  );
}
