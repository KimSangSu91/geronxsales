"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ConflictDialog } from "@/components/conflict-dialog";
import { CopyButton } from "@/components/copy-button";
import { DatePicker } from "@/components/date-picker";
import { Field, selectClass } from "@/components/form";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import type { AccountStatus, AccountType } from "@/generated/prisma/enums";
import { emptyAccount, validateAccount, type AccountInput } from "@/lib/account-input";
import type { FieldErrors } from "@/lib/customer-input";
import { formatDate } from "@/lib/date";
import { ACCOUNT_STATUS_LABEL, ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  addAccount,
  deleteAccount,
  revealAccountPassword,
  setPrimaryAccount,
  updateAccount,
  type Conflict,
} from "./actions";

export type AccountRow = AccountInput & { id: string; isPrimary: boolean; version: number; hasPassword: boolean };

const LABELS: Partial<Record<keyof AccountInput, string>> = {
  loginId: "계정 ID",
  type: "유형",
  typeOther: "유형(직접입력)",
  userName: "사용자",
  issuedOn: "발급일",
  status: "상태",
  deactivatedOn: "비활성일",
  memo: "메모",
};

function show(k: keyof AccountInput, v: string) {
  if (!v) return "-";
  if (k === "type") return ACCOUNT_TYPE_LABEL[v as AccountType];
  if (k === "status") return ACCOUNT_STATUS_LABEL[v as AccountStatus];
  if (k === "issuedOn" || k === "deactivatedOn") return formatDate(v);
  return v;
}

const typeText = (a: AccountInput) => (a.type === "OTHER" && a.typeOther ? a.typeOther : show("type", a.type));

type Filter = "IN_USE" | "INACTIVE" | "ALL";

export function AccountsSection({
  customerId,
  accounts,
  contactNames,
}: {
  customerId: string;
  accounts: AccountRow[];
  contactNames: string[];
}) {
  const [filter, setFilter] = useState<Filter>("IN_USE");
  const [editing, setEditing] = useState<{ id?: string; version?: number; hasPassword: boolean; base: AccountInput } | null>(
    null,
  );
  const [form, setForm] = useState<AccountInput>(emptyAccount());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<Conflict<AccountInput> | null>(null);
  const [deleting, setDeleting] = useState<AccountRow | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  useUnsavedChanges("accounts", !!editing && JSON.stringify(form) !== JSON.stringify(editing.base));

  const counts = {
    IN_USE: accounts.filter((a) => a.status === "IN_USE").length,
    INACTIVE: accounts.filter((a) => a.status === "INACTIVE").length,
    ALL: accounts.length,
  };
  const rows = filter === "ALL" ? accounts : accounts.filter((a) => a.status === filter);

  const open = (a?: AccountRow) => {
    const base: AccountInput = a
      ? {
          loginId: a.loginId,
          type: a.type,
          typeOther: a.typeOther,
          userName: a.userName,
          issuedOn: a.issuedOn,
          status: a.status,
          deactivatedOn: a.deactivatedOn,
          password: "",
          passwordClear: false,
          memo: a.memo,
        }
      : emptyAccount();
    setEditing({ id: a?.id, version: a?.version, hasPassword: !!a?.hasPassword, base });
    setForm(base);
    setErrors({});
    setMessage(undefined);
  };

  const save = () => {
    const found = validateAccount(form);
    setErrors(found);
    if (Object.keys(found).length) return setMessage("입력 내용을 확인하세요.");
    startTransition(async () => {
      const r = editing?.id ? await updateAccount(editing.id, editing.version!, form) : await addAccount(customerId, form);
      if (r.ok) {
        setEditing(null);
        toast.success(editing?.id ? "계정을 수정했습니다" : "계정을 추가했습니다");
        return;
      }
      if (r.conflict) return setConflict(r.conflict);
      setErrors(r.errors ?? {});
      setMessage(r.message);
    });
  };

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      after?.();
      if (r.ok) toast.success(success);
      else toast.error(r.message ?? "처리하지 못했습니다.");
    });

  const reveal = async (id: string) => {
    const r = await revealAccountPassword(id);
    if (r.ok && r.value !== undefined) setRevealed((m) => ({ ...m, [id]: r.value! }));
    return r.value;
  };

  const th = "px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";
  const td = "px-3 py-2.5 align-middle";

  return (
    <section id="section-accounts" className="scroll-mt-20 rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold">서비스 계정</h3>
          <div className="flex gap-1 text-sm">
            {(["IN_USE", "INACTIVE", "ALL"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-2.5 py-0.5",
                  filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f === "ALL" ? "전체" : ACCOUNT_STATUS_LABEL[f]} {counts[f]}
              </button>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => open()}>
          <Plus />
          계정 추가
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className={cn(th, "w-12 text-center")}>대표</th>
              <th className={th}>계정 ID</th>
              <th className={th}>유형</th>
              <th className={th}>사용자</th>
              <th className={th}>발급일</th>
              <th className={th}>상태</th>
              <th className={th}>비밀번호</th>
              <th className={th}>메모</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  {accounts.length === 0 ? "등록된 서비스 계정이 없습니다" : "해당 상태의 계정이 없습니다"}
                </td>
              </tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className={cn("border-b last:border-0", a.status === "INACTIVE" && "text-muted-foreground")}>
                <td className={cn(td, "text-center")}>
                  <button
                    type="button"
                    disabled={a.isPrimary || pending}
                    title={a.isPrimary ? "대표 관리자 계정" : "대표로 지정"}
                    onClick={() => run(() => setPrimaryAccount(a.id), `${a.loginId}을(를) 대표 계정으로 지정했습니다`)}
                    className="inline-flex rounded p-1 hover:bg-muted disabled:hover:bg-transparent"
                  >
                    <Star className={cn("size-4", a.isPrimary ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                  </button>
                </td>
                <td className={cn(td, "font-medium whitespace-nowrap")}>
                  <span className="flex items-center gap-0.5">
                    {a.loginId}
                    <CopyButton text={a.loginId} label="계정 ID 복사" />
                  </span>
                </td>
                <td className={td}>{typeText(a)}</td>
                <td className={td}>{show("userName", a.userName)}</td>
                <td className={cn(td, "whitespace-nowrap tabular-nums")}>{show("issuedOn", a.issuedOn)}</td>
                <td className={cn(td, "whitespace-nowrap")}>
                  {a.status === "IN_USE" ? (
                    <span className="text-emerald-700">사용</span>
                  ) : (
                    <span>비활성{a.deactivatedOn && ` (${formatDate(a.deactivatedOn)})`}</span>
                  )}
                </td>
                <td className={cn(td, "whitespace-nowrap")}>
                  {a.hasPassword ? (
                    <span className="flex items-center gap-0.5">
                      <span className="font-mono">{revealed[a.id] ?? "••••••"}</span>
                      <button
                        type="button"
                        title={revealed[a.id] ? "숨기기" : "보기 (조회 기록이 남습니다)"}
                        onClick={() =>
                          revealed[a.id]
                            ? setRevealed((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== a.id)))
                            : reveal(a.id)
                        }
                        className="inline-flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {revealed[a.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                      <CopyButton
                        getText={() => (revealed[a.id] ? Promise.resolve(revealed[a.id]) : reveal(a.id))}
                        label="비밀번호 복사"
                      />
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className={cn(td, "max-w-40 truncate")} title={a.memo}>
                  {show("memo", a.memo)}
                </td>
                <td className={cn(td, "text-right whitespace-nowrap")}>
                  <Button variant="ghost" size="icon-sm" title="수정" onClick={() => open(a)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" title="삭제" onClick={() => setDeleting(a)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 추가·수정 모달 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && !pending && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "서비스 계정 수정" : "서비스 계정 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="계정 ID" required error={errors.loginId}>
              <Input
                value={form.loginId}
                onChange={(e) => setForm({ ...form, loginId: e.target.value })}
                aria-invalid={!!errors.loginId}
              />
            </Field>
            <Field label="계정 유형" required error={errors.type ?? errors.typeOther}>
              <div className="flex gap-2">
                <select
                  className={selectClass}
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as AccountInput["type"] })}
                  aria-invalid={!!errors.type}
                >
                  <option value="">선택</option>
                  {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l === "기타" ? "기타(직접입력)" : l}
                    </option>
                  ))}
                </select>
                {form.type === "OTHER" && (
                  <Input
                    value={form.typeOther}
                    onChange={(e) => setForm({ ...form, typeOther: e.target.value })}
                    placeholder="직접입력"
                    aria-invalid={!!errors.typeOther}
                  />
                )}
              </div>
            </Field>
            <Field label="사용자">
              <Input
                list="contact-names"
                value={form.userName}
                onChange={(e) => setForm({ ...form, userName: e.target.value })}
              />
              <datalist id="contact-names">
                {contactNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <Field label="발급일" error={errors.issuedOn}>
              <DatePicker value={form.issuedOn || undefined} onChange={(v) => setForm({ ...form, issuedOn: v ?? "" })} />
            </Field>
            <Field label="상태" error={errors.status}>
              <select
                className={selectClass}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as AccountStatus })}
              >
                {Object.entries(ACCOUNT_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            {form.status === "INACTIVE" && (
              <Field label="비활성일" error={errors.deactivatedOn}>
                <DatePicker
                  value={form.deactivatedOn || undefined}
                  onChange={(v) => setForm({ ...form, deactivatedOn: v ?? "" })}
                />
              </Field>
            )}
            <Field
              label="비밀번호"
              className="sm:col-span-2"
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={form.password}
                disabled={form.passwordClear}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing?.hasPassword ? "변경할 때만 입력" : ""}
              />
              {editing?.hasPassword && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={form.passwordClear}
                    onChange={(e) => setForm({ ...form, passwordClear: e.target.checked, password: "" })}
                  />
                  저장된 비밀번호 삭제
                </span>
              )}
            </Field>
            <Field label="메모" className="sm:col-span-2">
              <Input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
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

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="서비스 계정 삭제"
        description={`${deleting?.loginId ?? ""} 계정을 삭제합니다. 복구할 수 없습니다. 사용을 중단한 계정은 삭제 대신 '비활성'으로 바꾸는 것을 권장합니다.`}
        confirmLabel="삭제"
        destructive
        pending={pending}
        onConfirm={() => run(() => deleteAccount(deleting!.id), "계정을 삭제했습니다", () => setDeleting(null))}
      />

      <ConflictDialog
        conflict={conflict}
        rows={
          conflict && editing
            ? (Object.keys(LABELS) as (keyof AccountInput)[])
                .filter((k) => conflict.latest[k] !== editing.base[k])
                .map((k) => ({
                  label: LABELS[k]!,
                  latest: show(k, String(conflict.latest[k])),
                  mine: show(k, String(form[k])),
                }))
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
    </section>
  );
}
