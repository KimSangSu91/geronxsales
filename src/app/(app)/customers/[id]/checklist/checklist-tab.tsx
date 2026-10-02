"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DatePicker } from "@/components/date-picker";
import { selectClass } from "@/components/form";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { MISSING_REASONS, recoveryErrors, type RecoveryInput } from "@/lib/checklist-rules";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { deactivateAllAccounts, saveRecovery, toggleEntry, updateSchedule } from "./actions";
import {
  CLOSURE_TYPE_LABEL,
  DEVICE_KIND_LABEL,
  type ChecklistView,
  type ClosureView,
  type EntryView,
} from "./checklist-shared";

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">진행률</span>
      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-foreground/70")} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("tabular-nums", pct === 100 && "font-medium text-emerald-700")}>
        {done}/{total}
      </span>
    </div>
  );
}

// 체크 · 항목 · 완료일 · 완료자 (+ 종료 체크리스트는 항목별 액션)
function EntryTable({
  entries,
  extra,
  onToggle,
  pendingId,
}: {
  entries: EntryView[];
  extra?: (e: EntryView) => React.ReactNode;
  onToggle: (e: EntryView) => void;
  pendingId: string | null;
}) {
  const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
  return (
    <table className="w-full text-sm">
      <thead className="border-b bg-muted/30">
        <tr>
          <th className={cn(th, "w-12 text-center")}>완료</th>
          <th className={th}>항목</th>
          <th className={cn(th, "w-32")}>완료일</th>
          <th className={cn(th, "w-32")}>완료자</th>
          {extra && <th className={th} />}
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id} className="border-b last:border-0">
            <td className="px-3 py-2.5 text-center">
              {pendingId === e.id ? (
                <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
              ) : (
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-emerald-600"
                  checked={e.done}
                  onChange={() => onToggle(e)}
                  aria-label={`${e.label} 완료`}
                />
              )}
            </td>
            <td className={cn("px-3 py-2.5", e.done && "text-muted-foreground")}>{e.label}</td>
            <td className="px-3 py-2.5 tabular-nums">{e.doneOn ? formatDate(e.doneOn) : "-"}</td>
            <td className="px-3 py-2.5">{e.doneBy ?? "-"}</td>
            {extra && <td className="px-3 py-2.5 text-right">{extra(e)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 체크·해제 공통 동작 (해제는 확인창)
function useToggle() {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [unchecking, setUnchecking] = useState<EntryView | null>(null);
  const [, startTransition] = useTransition();

  const run = (e: EntryView, checked: boolean) => {
    setPendingId(e.id);
    startTransition(async () => {
      const r = await toggleEntry(e.id, checked);
      setPendingId(null);
      if (!r.ok) toast.error(r.message ?? "처리하지 못했습니다.");
    });
  };
  const onToggle = (e: EntryView) => (e.done ? setUnchecking(e) : run(e, true));

  const dialog = (
    <ConfirmDialog
      open={!!unchecking}
      onOpenChange={(o) => !o && setUnchecking(null)}
      title="완료 해제"
      description={`'${unchecking?.label ?? ""}' 완료를 해제합니다. 완료일·완료자가 지워집니다.`}
      confirmLabel="해제"
      onConfirm={() => {
        const e = unchecking!;
        setUnchecking(null);
        run(e, false);
      }}
    />
  );
  return { pendingId, onToggle, dialog };
}

function OnboardingCard({ customerId, data }: { customerId: string; data: ChecklistView }) {
  const router = useRouter();
  const { pendingId, onToggle, dialog } = useToggle();
  const [saving, startTransition] = useTransition();
  const doneCount = data.onboarding.filter((e) => e.done).length;

  const saveDate = (key: "meetingDate" | "installDate", value: string) => {
    startTransition(async () => {
      const r = await updateSchedule(customerId, data.version, {
        meetingDate: key === "meetingDate" ? value : data.meetingDate,
        installDate: key === "installDate" ? value : data.installDate,
      });
      if (r.ok) toast.success("일정을 저장했습니다");
      else {
        toast.error(r.message ?? "저장하지 못했습니다.");
        if (r.conflict) router.refresh();
      }
    });
  };

  return (
    <section className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <h3 className="font-semibold">도입 체크리스트</h3>
        <Progress done={doneCount} total={data.onboarding.length} />
      </div>
      <div className="flex flex-wrap items-center gap-4 border-b px-5 py-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">미팅일</span>
          <DatePicker className="w-40" value={data.meetingDate || undefined} onChange={(v) => saveDate("meetingDate", v ?? "")} />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">설치 예정일</span>
          <DatePicker className="w-40" value={data.installDate || undefined} onChange={(v) => saveDate("installDate", v ?? "")} />
        </label>
        {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      {data.onboarding.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">도입 체크리스트가 없습니다</p>
      ) : (
        <EntryTable
          entries={data.onboarding.map((e) =>
            e.code === "account_created" ? { ...e, label: `${e.label} (등록 계정 ${data.accounts.total}개)` } : e,
          )}
          onToggle={onToggle}
          pendingId={pendingId}
        />
      )}
      {dialog}
    </section>
  );
}

function RecoveryPanel({ closure, today }: { closure: ClosureView; today: string }) {
  const initial: RecoveryInput = {
    recoveredOn: closure.recoveredOn ?? "",
    lines: closure.recovery.map((l) => ({
      id: l.id,
      providedQty: String(l.providedQty),
      recoveredQty: String(l.recoveredQty),
      missingReason: l.missingReason ?? "",
    })),
  };
  const [form, setForm] = useState<RecoveryInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  useUnsavedChanges(`recovery-${closure.id}`, JSON.stringify(form) !== JSON.stringify(initial));

  const setLine = (id: string, patch: Partial<RecoveryInput["lines"][number]>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const save = () => {
    const found = recoveryErrors(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    startTransition(async () => {
      const r = await saveRecovery(closure.id, form);
      if (r.ok) toast.success("회수 내역을 저장했습니다");
      else {
        setErrors(r.errors ?? {});
        toast.error(r.message ?? "저장하지 못했습니다.");
      }
    });
  };

  const reasonType = (v: string) => (v.startsWith("기타") ? "기타" : v);
  const reasonText = (v: string) => (v.startsWith("기타: ") ? v.slice(4) : "");

  return (
    <div className="border-t bg-muted/20 px-5 py-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">기기</th>
            <th className="w-24 pb-2 font-medium">제공</th>
            <th className="w-24 pb-2 font-medium">회수</th>
            <th className="pb-2 font-medium">미회수 사유</th>
          </tr>
        </thead>
        <tbody>
          {form.lines.map((l) => {
            const view = closure.recovery.find((x) => x.id === l.id)!;
            const name = view.kind === "OTHER" ? (view.label ?? "기타") : DEVICE_KIND_LABEL[view.kind];
            const short = Number(l.recoveredQty) < Number(l.providedQty);
            return (
              <tr key={l.id} className="align-top">
                <td className="py-1 pr-2">{name}</td>
                <td className="py-1 pr-2">
                  <Input
                    inputMode="numeric"
                    value={l.providedQty}
                    onChange={(e) => setLine(l.id, { providedQty: e.target.value })}
                    aria-invalid={!!errors[`${l.id}.providedQty`]}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    inputMode="numeric"
                    value={l.recoveredQty}
                    onChange={(e) => setLine(l.id, { recoveredQty: e.target.value })}
                    aria-invalid={!!errors[`${l.id}.recoveredQty`]}
                  />
                  {errors[`${l.id}.recoveredQty`] && (
                    <span className="text-xs text-destructive">{errors[`${l.id}.recoveredQty`]}</span>
                  )}
                </td>
                <td className="py-1">
                  {short ? (
                    <div className="flex gap-2">
                      <select
                        className={cn(selectClass, "w-24")}
                        value={reasonType(l.missingReason)}
                        onChange={(e) => setLine(l.id, { missingReason: e.target.value === "기타" ? "기타: " : e.target.value })}
                      >
                        <option value="">선택</option>
                        {MISSING_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {reasonType(l.missingReason) === "기타" && (
                        <Input
                          value={reasonText(l.missingReason)}
                          onChange={(e) => setLine(l.id, { missingReason: `기타: ${e.target.value}` })}
                          placeholder="사유 입력"
                          aria-invalid={!!errors[`${l.id}.missingReason`]}
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{Number(l.providedQty) > 0 ? "전량 회수" : "-"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">회수일</span>
          <DatePicker className="w-40" value={form.recoveredOn || undefined} onChange={(v) => setForm({ ...form, recoveredOn: v ?? "" })} />
        </label>
        {!form.recoveredOn && (
          <button type="button" className="text-xs underline underline-offset-4" onClick={() => setForm({ ...form, recoveredOn: today })}>
            오늘
          </button>
        )}
        <Button size="sm" className="ml-auto" onClick={save} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          회수 내역 저장
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        회수일을 입력하고, 덜 회수된 기기에 미회수 사유를 넣어야 &apos;장비 회수&apos;를 완료 체크할 수 있습니다.
      </p>
    </div>
  );
}

function ClosureCard({
  customerId,
  closure,
  inUseAccounts,
  today,
}: {
  customerId: string;
  closure: ClosureView;
  inUseAccounts: string[];
  today: string;
}) {
  const { pendingId, onToggle, dialog } = useToggle();
  const [openRecovery, setOpenRecovery] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [pending, startTransition] = useTransition();
  const doneCount = closure.entries.filter((e) => e.done).length;

  const extra = (e: EntryView) => {
    if (e.code === "recovery") {
      return (
        <button
          type="button"
          onClick={() => setOpenRecovery(!openRecovery)}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          회수 내역 {openRecovery ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      );
    }
    if (e.code === "account_deactivation") {
      return inUseAccounts.length ? (
        <Button variant="outline" size="xs" onClick={() => setConfirmDeactivate(true)}>
          일괄 비활성 처리 ({inUseAccounts.length}개)
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">사용 중 계정 없음</span>
      );
    }
    return null;
  };

  return (
    <section className={cn("rounded-lg border bg-background", closure.completed && "opacity-80")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <h3 className="font-semibold">
          {closure.type === "NOT_CONVERTED" ? "장비 회수 체크리스트" : "회수·종료 체크리스트"}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {formatDate(closure.createdOn)} {CLOSURE_TYPE_LABEL[closure.type]}
            {closure.completed && " · 완료"}
          </span>
        </h3>
        <Progress done={doneCount} total={closure.entries.length} />
      </div>
      <EntryTable entries={closure.entries} extra={extra} onToggle={onToggle} pendingId={pendingId} />
      {openRecovery && <RecoveryPanel closure={closure} today={today} />}
      {dialog}
      <ConfirmDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title="서비스 계정 일괄 비활성 처리"
        description={`사용 중인 계정 ${inUseAccounts.length}개(${inUseAccounts.join(", ")})를 비활성으로 바꿉니다. 비활성일은 오늘로 기록됩니다.`}
        confirmLabel="비활성 처리"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const r = await deactivateAllAccounts(customerId);
            setConfirmDeactivate(false);
            if (r.ok) toast.success("서비스 계정을 비활성 처리했습니다");
            else toast.error(r.message ?? "처리하지 못했습니다.");
          })
        }
      />
    </section>
  );
}

// 체크리스트 탭 (화면정의서 4-4): 진행 중인 회수·종료 → 도입 → 완료된 회수·종료 순
export function ChecklistTab({ customerId, data, today }: { customerId: string; data: ChecklistView; today: string }) {
  const open = data.closures.filter((c) => !c.completed);
  const closed = data.closures.filter((c) => c.completed);
  const closureCard = (c: ClosureView) => (
    <ClosureCard key={c.id} customerId={customerId} closure={c} inUseAccounts={data.accounts.inUse} today={today} />
  );
  const onboarding = <OnboardingCard customerId={customerId} data={data} />;

  return (
    <div className="flex flex-col gap-4">
      {open.map(closureCard)}
      {onboarding}
      {closed.map(closureCard)}
    </div>
  );
}
