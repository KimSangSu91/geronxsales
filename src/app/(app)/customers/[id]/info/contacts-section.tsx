"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ConflictDialog } from "@/components/conflict-dialog";
import { CopyButton } from "@/components/copy-button";
import { Field, selectClass } from "@/components/form";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import type { ContactRole } from "@/generated/prisma/enums";
import { validateContact, type FieldErrors } from "@/lib/customer-input";
import { CONTACT_ROLE_LABEL } from "@/lib/labels";
import { PRIMARY_CONTACT_REQUIRED_MESSAGE, wouldLeaveNoPrimary } from "@/lib/status-rules";
import { cn } from "@/lib/utils";
import {
  addContact,
  deleteContact,
  togglePrimaryContact,
  updateContact,
  type Conflict,
  type ContactPayload,
} from "./actions";

export type ContactRow = ContactPayload & { id: string; version: number };

const EMPTY: ContactPayload = { name: "", phone: "", role: "", title: "", email: "", memo: "", isPrimary: false };
const LABELS: Record<keyof ContactPayload, string> = {
  name: "이름",
  phone: "연락처",
  role: "역할",
  title: "직책",
  email: "이메일",
  memo: "메모",
  isPrimary: "대표 담당자",
};
const show = (k: keyof ContactPayload, v: string | boolean) =>
  k === "isPrimary" ? (v ? "지정" : "해제") : !v ? "-" : k === "role" ? CONTACT_ROLE_LABEL[v as ContactRole] : String(v);

export function ContactsSection({ customerId, contacts }: { customerId: string; contacts: ContactRow[] }) {
  // 편집 모달: null = 닫힘, id 없음 = 추가
  const [editing, setEditing] = useState<{ id?: string; version?: number; base: ContactPayload } | null>(null);
  const [form, setForm] = useState<ContactPayload>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<Conflict<ContactPayload> | null>(null);
  const [deleting, setDeleting] = useState<ContactRow | null>(null);
  const [pending, startTransition] = useTransition();

  const primaryIds = contacts.filter((c) => c.isPrimary).map((c) => c.id);
  // 이 담당자의 대표 지정을 풀면 대표가 0명이 되는지 / 대표가 아예 없어 새 담당자를 대표로 해야 하는지
  const isLastPrimary = (id?: string) => !!id && wouldLeaveNoPrimary(primaryIds, id);
  const mustBePrimary = primaryIds.length === 0 || isLastPrimary(editing?.id);

  useUnsavedChanges("contacts", !!editing && JSON.stringify(form) !== JSON.stringify(editing.base));

  const open = (c?: ContactRow) => {
    const base: ContactPayload = c
      ? { name: c.name, phone: c.phone, role: c.role, title: c.title, email: c.email, memo: c.memo, isPrimary: c.isPrimary }
      : { ...EMPTY, isPrimary: primaryIds.length === 0 };
    setEditing({ id: c?.id, version: c?.version, base });
    setForm(base);
    setErrors({});
    setMessage(undefined);
  };

  const save = () => {
    const found = validateContact(form, true);
    setErrors(found);
    if (Object.keys(found).length) return setMessage("입력 내용을 확인하세요.");
    startTransition(async () => {
      const payload = { ...form, isPrimary: form.isPrimary || mustBePrimary };
      const r = editing?.id
        ? await updateContact(editing.id, editing.version!, payload)
        : await addContact(customerId, payload);
      if (r.ok) {
        setEditing(null);
        toast.success(editing?.id ? "담당자를 수정했습니다" : "담당자를 추가했습니다");
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

  const th = "px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";
  const td = "px-3 py-2.5 align-middle";

  return (
    <section id="section-contacts" className="scroll-mt-20 rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="font-semibold">
          시설 담당자 <span className="ml-1 text-sm font-normal text-muted-foreground">{contacts.length}명</span>
        </h3>
        <Button variant="ghost" size="sm" onClick={() => open()}>
          <Plus />
          담당자 추가
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className={cn(th, "w-12 text-center")} title="대표 담당자: 실무·주 소통 담당자 (여러 명 가능)">대표</th>
              <th className={th}>이름</th>
              <th className={th}>역할</th>
              <th className={th}>직책</th>
              <th className={th}>연락처</th>
              <th className={th}>이메일</th>
              <th className={th}>메모</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  등록된 담당자가 없습니다
                </td>
              </tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className={cn(td, "text-center")}>
                  <button
                    type="button"
                    disabled={pending}
                    title={c.isPrimary ? "대표 담당자 해제" : "대표 담당자로 지정"}
                    onClick={() =>
                      c.isPrimary && isLastPrimary(c.id)
                        ? toast.error(PRIMARY_CONTACT_REQUIRED_MESSAGE)
                        : run(
                            () => togglePrimaryContact(c.id, !c.isPrimary),
                            c.isPrimary
                              ? `${c.name}님을 대표 담당자에서 해제했습니다`
                              : `${c.name}님을 대표 담당자로 지정했습니다`,
                          )
                    }
                    className="inline-flex rounded p-1 hover:bg-muted"
                  >
                    <Star className={cn("size-4", c.isPrimary ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                  </button>
                </td>
                <td className={cn(td, "font-medium whitespace-nowrap")}>{c.name}</td>
                <td className={td}>{show("role", c.role)}</td>
                <td className={td}>{show("title", c.title)}</td>
                <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                  {c.phone ? (
                    <span className="flex items-center gap-0.5">
                      {c.phone}
                      <CopyButton text={c.phone} label="연락처 복사" />
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className={cn(td, "break-all")}>{show("email", c.email)}</td>
                <td className={cn(td, "max-w-48 truncate")} title={c.memo}>
                  {show("memo", c.memo)}
                </td>
                <td className={cn(td, "text-right whitespace-nowrap")}>
                  <Button variant="ghost" size="icon-sm" title="수정" onClick={() => open(c)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="삭제"
                    onClick={() =>
                      contacts.length <= 1
                        ? toast.error("시설 담당자는 1명 이상 있어야 합니다. 다른 담당자를 먼저 추가하세요.")
                        : c.isPrimary && isLastPrimary(c.id)
                          ? toast.error(PRIMARY_CONTACT_REQUIRED_MESSAGE)
                          : setDeleting(c)
                    }
                  >
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
            <DialogTitle>{editing?.id ? "담당자 수정" : "담당자 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="이름" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />
            </Field>
            <Field label="연락처" required error={errors.phone}>
              <Input
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="010-0000-0000"
                aria-invalid={!!errors.phone}
              />
            </Field>
            <Field label="역할" error={errors.role}>
              <select
                className={selectClass}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as ContactPayload["role"] })}
              >
                <option value="">선택</option>
                {Object.entries(CONTACT_ROLE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="직책">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예) 간호팀장" />
            </Field>
            <Field label="이메일" error={errors.email} className="sm:col-span-2">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                aria-invalid={!!errors.email}
              />
            </Field>
            <Field label="메모" className="sm:col-span-2">
              <Input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.isPrimary || mustBePrimary}
                disabled={mustBePrimary}
                onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
              />
              대표 담당자로 지정
              <span className="text-xs text-muted-foreground">
                {mustBePrimary
                  ? "대표 담당자는 1명 이상 필요해서 해제할 수 없습니다"
                  : "실무·주 소통 담당자 (여러 명 지정 가능, 1명 이상 필수)"}
              </span>
            </label>
            {errors.isPrimary && <p className="text-xs text-destructive sm:col-span-2">{errors.isPrimary}</p>}
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
        title="담당자 삭제"
        description={`${deleting?.name ?? ""}님을 삭제합니다. 복구할 수 없습니다.`}
        confirmLabel="삭제"
        destructive
        pending={pending}
        onConfirm={() => run(() => deleteContact(deleting!.id), "담당자를 삭제했습니다", () => setDeleting(null))}
      />

      <ConflictDialog
        conflict={conflict}
        rows={
          conflict && editing
            ? (Object.keys(LABELS) as (keyof ContactPayload)[])
                .filter((k) => conflict.latest[k] !== editing.base[k])
                .map((k) => ({ label: LABELS[k], latest: show(k, conflict.latest[k]), mine: show(k, form[k]) }))
            : []
        }
        onCancel={() => {
          setConflict(null);
          setEditing(null);
        }}
        onReedit={() => {
          if (!conflict || !editing) return;
          setEditing({ id: editing.id, version: conflict.version, base: conflict.latest });
          setForm(conflict.latest);
          setErrors({});
          setMessage(undefined);
          setConflict(null);
        }}
      />
    </section>
  );
}
