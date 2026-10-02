"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ConflictDialog } from "@/components/conflict-dialog";
import { Field } from "@/components/form";
import { MoneyInput } from "@/components/money-input";
import { MonthPicker } from "@/components/month-picker";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import type { FieldErrors } from "@/lib/customer-input";
import { formatWon, withVat } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Conflict, Result } from "./actions";

// ───────── 비용·옵션상품·추가 기기 공통 표 (같은 컬럼 순서·폭, 기능정의서 4-4) ─────────

export type CostRow = {
  id: string;
  item: string;
  detail: string;
  qty: string;
  date: string;
  type: string;
  amount: number;
  isFree: boolean;
  memo: string;
  auto?: string; // 자동으로 정리된 줄: 출처 표시("계약"·"옵션상품"·"추가 기기"), 수정·삭제 없음
};

export function CostTable({
  title,
  rows,
  footer,
  onAdd,
  onEdit,
  onDelete,
  addDisabledReason,
  readOnly,
}: {
  title: string;
  rows: CostRow[];
  footer?: React.ReactNode;
  onAdd?: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  addDisabledReason?: string;
  readOnly?: boolean;
}) {
  // 첫·마지막 칸은 카드 제목과 같은 좌우 여백(px-5)
  const th = "px-2 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5";
  const td = "px-2 py-2.5 align-middle first:pl-5 last:pr-5";
  return (
    <section className="rounded-lg border bg-background">
      <div className="card-head">
        <h3 className="font-semibold">{title}</h3>
        {!readOnly && (
          <Button variant="ghost" size="sm" onClick={onAdd} disabled={!!addDisabledReason} title={addDisabledReason}>
            <Plus />
            추가
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        {/* 가로 스크롤 없이 화면 폭에 맞춤: 열 폭 고정, 긴 글자는 … (마우스를 올리면 전체) */}
        <table className="data-table w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[16%]" />
            <col className="w-10" />
            <col className="w-[20%]" />
            <col className="w-10" />
            <col className="w-[15%]" />
            <col />
            {!readOnly && <col className="w-[84px]" />}
          </colgroup>
          <thead className="border-b bg-muted/30">
            <tr>
              <th className={th}>항목</th>
              <th className={th}>상세</th>
              <th className={th}>수량</th>
              <th className={th}>일자</th>
              <th className={th}>유형</th>
              <th className={cn(th, "text-right")}>금액(공급가)</th>
              <th className={th}>메모</th>
              {!readOnly && <th className={th} />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 7 : 8} className="py-6 text-center text-muted-foreground">
                  {addDisabledReason ?? "등록된 항목이 없습니다"}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className={cn(td, "truncate font-medium")} title={r.item}>
                  {r.item}
                  {r.auto && <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground">{r.auto}</span>}
                </td>
                <td className={cn(td, "truncate")} title={r.detail}>
                  {r.detail || "-"}
                </td>
                <td className={cn(td, "tabular-nums")}>{r.qty || "-"}</td>
                <td className={cn(td, "truncate text-xs")} title={r.date}>
                  {r.date || "-"}
                </td>
                <td className={td}>{r.type}</td>
                <td className={cn(td, "text-right tabular-nums")}>
                  {r.isFree ? (
                    <span className="text-muted-foreground">무상</span>
                  ) : (
                    <>
                      <p className="truncate">{formatWon(r.amount)}</p>
                      <p className="truncate text-xs text-muted-foreground">VAT {formatWon(withVat(r.amount))}</p>
                    </>
                  )}
                </td>
                <td className={cn(td, "truncate text-muted-foreground")} title={r.memo}>
                  {r.memo || "-"}
                </td>
                {!readOnly && (
                  <td className={cn(td, "text-right whitespace-nowrap")}>
                    {!r.auto && (
                      <>
                        <Button variant="ghost" size="icon-sm" title="수정" onClick={() => onEdit?.(r.id)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="삭제" onClick={() => onDelete?.(r.id)}>
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && <div className="border-t px-5 py-2.5 text-sm">{footer}</div>}
    </section>
  );
}

// ───────── 무상·금액·청구월 입력 묶음 ─────────

export type Priced = { amount: string; isFree: boolean; freeReason: string; billingMonth: string };

export function PriceFields<T extends Priced>({
  form,
  setForm,
  errors,
  showMonth,
  monthHint,
}: {
  form: T;
  setForm: (f: T) => void;
  errors: FieldErrors;
  showMonth: boolean;
  monthHint?: string;
}) {
  return (
    <>
      <Field label="금액 (공급가)" required={!form.isFree} error={errors.amount}>
        <MoneyInput
          value={form.isFree ? "" : form.amount}
          disabled={form.isFree}
          invalid={!!errors.amount}
          onChange={(v) => setForm({ ...form, amount: v })}
        />
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="accent-primary"
            checked={form.isFree}
            onChange={(e) => setForm({ ...form, isFree: e.target.checked, amount: e.target.checked ? "" : form.amount })}
          />
          무상 (0원)
        </label>
      </Field>
      {form.isFree ? (
        <Field label="무상 사유" required error={errors.freeReason}>
          <Input value={form.freeReason} onChange={(e) => setForm({ ...form, freeReason: e.target.value })} aria-invalid={!!errors.freeReason} />
        </Field>
      ) : showMonth ? (
        <Field label="청구월" required error={errors.billingMonth} hint={monthHint && <span className="text-xs text-muted-foreground">{monthHint}</span>}>
          <MonthPicker
            value={form.billingMonth || undefined}
            onChange={(v) => setForm({ ...form, billingMonth: v ?? "" })}
            invalid={!!errors.billingMonth}
          />
        </Field>
      ) : (
        <div />
      )}
    </>
  );
}

// ───────── 추가·수정 모달 + 삭제 확인 + 충돌 처리 공통 ─────────

export function useCostEditor<T extends object>(opts: {
  key: string;
  empty: () => T;
  validate: (v: T) => FieldErrors;
  add: (v: T) => Promise<Result>;
  update: (id: string, version: number, v: T) => Promise<Result<T>>;
  remove: (id: string) => Promise<Result>;
  labels: Partial<Record<keyof T, string>>;
  show: (k: keyof T, v: unknown) => string;
  rows: { id: string; version: number; input: T }[];
  name: string; // "비용 항목" 등 (안내 문구)
  describe: (v: T) => string; // 삭제 확인 문구용
}) {
  const [editing, setEditing] = useState<{ id?: string; version?: number; base: T } | null>(null);
  const [form, setForm] = useState<T>(opts.empty());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<Conflict<T> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useUnsavedChanges(opts.key, !!editing && JSON.stringify(form) !== JSON.stringify(editing.base));

  const open = (id?: string, initial?: T) => {
    const row = id ? opts.rows.find((r) => r.id === id) : undefined;
    const base = row ? row.input : (initial ?? opts.empty());
    setEditing({ id: row?.id, version: row?.version, base });
    setForm(base);
    setErrors({});
    setMessage(undefined);
  };

  const save = () => {
    const found = opts.validate(form);
    setErrors(found);
    if (Object.keys(found).length) return setMessage("입력 내용을 확인하세요.");
    startTransition(async () => {
      const r = editing?.id ? await opts.update(editing.id, editing.version!, form) : await opts.add(form);
      if (r.ok) {
        setEditing(null);
        toast.success(`${opts.name}을(를) ${editing?.id ? "수정" : "추가"}했습니다`);
        return;
      }
      if (r.conflict) return setConflict(r.conflict as Conflict<T>);
      setErrors(r.errors ?? {});
      setMessage(r.message);
    });
  };

  const deleteDialog = (
    <ConfirmDialog
      open={!!deleting}
      onOpenChange={(o) => !o && setDeleting(null)}
      title={`${opts.name} 삭제`}
      description={(() => {
        const row = opts.rows.find((r) => r.id === deleting);
        return `${row ? opts.describe(row.input) : ""}을(를) 삭제합니다. 복구할 수 없습니다.`;
      })()}
      confirmLabel="삭제"
      destructive
      pending={pending}
      onConfirm={() =>
        startTransition(async () => {
          const r = await opts.remove(deleting!);
          setDeleting(null);
          if (r.ok) toast.success(`${opts.name}을(를) 삭제했습니다`);
          else toast.error(r.message ?? "삭제하지 못했습니다.");
        })
      }
    />
  );

  const dialog = (title: string, body: React.ReactNode) => (
    <>
      <Dialog open={!!editing} onOpenChange={(o) => !o && !pending && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {title} {editing?.id ? "수정" : "추가"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{body}</div>
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
      {deleteDialog}
      <ConflictDialog
        conflict={conflict}
        rows={
          conflict && editing
            ? (Object.keys(opts.labels) as (keyof T)[])
                .filter((k) => String(conflict.latest[k]) !== String(editing.base[k]))
                .map((k) => ({ label: opts.labels[k]!, latest: opts.show(k, conflict.latest[k]), mine: opts.show(k, form[k]) }))
            : []
        }
        onCancel={() => {
          setConflict(null);
          setEditing(null);
        }}
        onReedit={() => {
          if (!conflict || !editing) return;
          setEditing({ ...editing, version: conflict.version, base: conflict.latest });
          setForm(conflict.latest);
          setErrors({});
          setMessage(undefined);
          setConflict(null);
        }}
      />
    </>
  );

  return { form, setForm, errors, open, setDeleting, dialog, editing };
}
