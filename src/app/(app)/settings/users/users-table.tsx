"use client";

import { useState, useTransition } from "react";
import { History, KeyRound, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { copyText } from "@/components/copy-button";
import { Field, selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { UserRole } from "@/generated/prisma/enums";
import { USER_ROLE_LABEL } from "@/lib/labels";
import { deviceLabel } from "@/lib/user-agent";
import { cn } from "@/lib/utils";
import { createUser, deactivateUser, reactivateUser, resetPassword, setRole, userLoginLogs } from "./actions";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  owned: number;
  lastLogin: string | null;
};

type Log = Awaited<ReturnType<typeof userLoginLogs>>[number];
const EMPTY = { email: "", name: "", phone: "", role: "MEMBER" as UserRole };

export function UsersTable({ rows, meId }: { rows: UserRow[]; meId: string }) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [deactivating, setDeactivating] = useState<UserRow | null>(null);
  const [heirId, setHeirId] = useState("");
  const [logs, setLogs] = useState<{ user: UserRow; rows: Log[] | null } | null>(null);
  const active = rows.filter((r) => r.isActive);

  const submitAdd = () =>
    startTransition(async () => {
      const r = await createUser(form);
      if (!r.ok) {
        setErrors(r.errors ?? {});
        if (!r.errors) toast.error(r.message);
        return;
      }
      setAdding(false);
      setIssued({ name: form.name.trim(), email: form.email.trim().toLowerCase(), password: r.password });
      setForm(EMPTY);
      setErrors({});
    });

  const changeRole = (u: UserRow, role: UserRole) =>
    startTransition(async () => {
      const r = await setRole(u.id, role);
      if (r.ok) toast.success(`${u.name}님 권한을 ${USER_ROLE_LABEL[role]}(으)로 바꿨습니다`);
      else toast.error(r.message);
    });

  const openLogs = (u: UserRow) => {
    setLogs({ user: u, rows: null });
    userLoginLogs(u.id).then((rows) => setLogs({ user: u, rows }));
  };

  const td = "align-middle";
  return (
    <section className="rounded-lg border bg-background">
      <div className="card-head">
        <h2>
          사용자 <span className="text-sm font-normal text-muted-foreground">{rows.length}명</span>
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          사용자 추가
        </Button>
      </div>
      <table className="data-table w-full table-fixed text-sm">
        <colgroup>
          <col className="w-32" />
          <col />
          <col className="w-32" />
          <col className="w-28" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-36" />
          <col className="w-[18.5rem]" />
        </colgroup>
        <thead>
          <tr className="text-left">
            <th>이름</th>
            <th>이메일</th>
            <th>연락처</th>
            <th>권한</th>
            <th>상태</th>
            <th className="text-right">담당 고객사</th>
            <th>최근 로그인</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className={cn("border-b last:border-0", !u.isActive && "text-muted-foreground")}>
              <td className={cn(td, "truncate font-medium")}>
                {u.name}
                {u.id === meId && <span className="ml-1 text-xs font-normal text-muted-foreground">(나)</span>}
              </td>
              <td className={cn(td, "truncate")} title={u.email}>
                {u.email}
              </td>
              <td className={cn(td, "tabular-nums")}>{u.phone ?? "-"}</td>
              <td className={td}>
                <select
                  className={cn(selectClass, "h-8")}
                  value={u.role}
                  disabled={pending || u.id === meId || !u.isActive}
                  onChange={(e) => changeRole(u, e.target.value as UserRole)}
                >
                  {Object.entries(USER_ROLE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              <td className={td}>
                {u.isActive ? (
                  <span className="inline-flex h-5 items-center rounded-full bg-emerald-50 px-2 text-xs font-medium text-emerald-700">활성</span>
                ) : (
                  <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-xs font-medium">비활성</span>
                )}
                {u.isActive && u.mustChangePassword && <p className="mt-0.5 text-xs text-orange-600">임시 비밀번호</p>}
              </td>
              <td className={cn(td, "text-right tabular-nums")}>{u.owned}곳</td>
              <td className={cn(td, "text-xs tabular-nums")}>{u.lastLogin ?? "-"}</td>
              <td className={cn(td, "text-right")}>
                <span className="inline-flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openLogs(u)}>
                    <History />
                    로그인 기록
                  </Button>
                  {u.isActive && (
                    <Button variant="ghost" size="sm" onClick={() => setResetting(u)}>
                      <KeyRound />
                      재발급
                    </Button>
                  )}
                  {u.id !== meId &&
                    (u.isActive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          setHeirId("");
                          setDeactivating(u);
                        }}
                      >
                        비활성화
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await reactivateUser(u.id);
                            if (r.ok) toast.success(`${u.name}님 계정을 다시 활성화했습니다`);
                            else toast.error(r.message);
                          })
                        }
                      >
                        재활성화
                      </Button>
                    ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 사용자 추가 */}
      <Dialog open={adding} onOpenChange={(o) => !pending && setAdding(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용자 추가</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <Field label="이메일 (로그인 아이디)" required error={errors.email}>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={!!errors.email} />
            </Field>
            <Field label="이름" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />
            </Field>
            <Field label="연락처" error={errors.phone}>
              <Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
            </Field>
            <Field label="권한" required error={errors.role}>
              <select className={selectClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                {Object.entries(USER_ROLE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">이메일·이름은 저장 후 바꿀 수 없습니다.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)} disabled={pending}>
              취소
            </Button>
            <Button onClick={submitAdd} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 임시 비밀번호 1회 표시 */}
      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>임시 비밀번호</DialogTitle>
          </DialogHeader>
          {issued && (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                <b>{issued.name}</b> ({issued.email})
              </p>
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3">
                <span className="font-mono text-lg tracking-wider">{issued.password}</span>
                <Button variant="outline" size="sm" onClick={() => copyText(`아이디: ${issued.email}\n임시 비밀번호: ${issued.password}`, "아이디와 비밀번호를 복사했습니다")}>
                  복사
                </Button>
              </div>
              <p className="text-xs text-destructive">이 창을 닫으면 다시 볼 수 없습니다.</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!resetting}
        onOpenChange={(o) => !o && setResetting(null)}
        title="임시 비밀번호 재발급"
        description={`${resetting?.name ?? ""}님의 비밀번호를 새 임시 비밀번호로 바꿉니다. 기존 비밀번호는 더 이상 쓸 수 없습니다.`}
        confirmLabel="재발급"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const u = resetting!;
            const r = await resetPassword(u.id);
            setResetting(null);
            if (r.ok) setIssued({ name: u.name, email: u.email, password: r.password });
            else toast.error(r.message);
          })
        }
      />

      {/* 비활성화 — 담당 고객사 인계 */}
      <Dialog open={!!deactivating} onOpenChange={(o) => !o && !pending && setDeactivating(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>계정 비활성화</DialogTitle>
          </DialogHeader>
          {deactivating && (
            <div className="flex flex-col gap-4 text-sm">
              <p>
                <b>{deactivating.name}</b>님은 더 이상 로그인할 수 없습니다. 작성한 기록은 그대로 남습니다.
              </p>
              {deactivating.owned > 0 && (
                <Field label={`담당 고객사 ${deactivating.owned}곳을 넘겨받을 담당자`}>
                  <select className={selectClass} value={heirId} onChange={(e) => setHeirId(e.target.value)}>
                    <option value="">넘기지 않음 (재배정 필요로 표시)</option>
                    {active
                      .filter((u) => u.id !== deactivating.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivating(null)} disabled={pending}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const u = deactivating!;
                  const r = await deactivateUser(u.id, heirId || null);
                  if (!r.ok) return void toast.error(r.message);
                  setDeactivating(null);
                  toast.success(r.moved ? `비활성화했습니다 · 담당 고객사 ${r.moved}곳 인계` : "비활성화했습니다");
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              비활성화
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 로그인 기록 */}
      <Dialog open={!!logs} onOpenChange={(o) => !o && setLogs(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{logs?.user.name} 로그인 기록 (최근 90일)</DialogTitle>
          </DialogHeader>
          <LoginLogTable rows={logs?.rows ?? null} />
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function LoginLogTable({ rows }: { rows: Log[] | null }) {
  if (!rows) return <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />;
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">로그인 기록이 없습니다</p>;
  return (
    <div className="max-h-[60vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
          <tr className="border-b text-left">
            <th className="py-2 font-medium">일시</th>
            <th className="py-2 font-medium">IP</th>
            <th className="py-2 font-medium">기기 · 브라우저</th>
            <th className="py-2 text-right font-medium">결과</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-2 tabular-nums">{r.at}</td>
              <td className="py-2 tabular-nums">{r.ip ?? "-"}</td>
              <td className="py-2">{deviceLabel(r.userAgent)}</td>
              <td className={cn("py-2 text-right", r.success ? "text-emerald-700" : "text-destructive")}>{r.success ? "성공" : "실패"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
