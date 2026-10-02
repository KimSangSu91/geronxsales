"use client";

import { useState, useTransition } from "react";
import { Check, Eye, EyeOff, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConflictDialog, type ConflictRow } from "@/components/conflict-dialog";
import { CopyButton } from "@/components/copy-button";
import { Field, selectClass, textareaClass } from "@/components/form";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { CODE_RE, type FieldErrors } from "@/lib/customer-input";
import { cn } from "@/lib/utils";
import { checkCodeAvailable } from "../../actions";
import { revealWifiPassword, updateCustomerSection, type Conflict } from "./actions";
import { displayValue, SECTIONS, visibleFields, type FieldDef, type SectionKey, type Values } from "./sections";

type Owner = { id: string; name: string; isActive: boolean };

export function SectionCard({
  customerId,
  section,
  values,
  version,
  owners,
  hasWifiPassword,
  defaultEditing = false,
}: {
  customerId: string;
  section: SectionKey;
  values: Values; // 이 섹션의 현재 값
  version: number;
  owners: Owner[];
  hasWifiPassword: boolean;
  defaultEditing?: boolean;
}) {
  const title = SECTIONS[section].title;
  const [editing, setEditing] = useState(defaultEditing);
  const [form, setForm] = useState<Values>(values);
  const [base, setBase] = useState({ values, version }); // 편집 시작 시점의 값·version
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<Conflict<Values> | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [codeCheck, setCodeCheck] = useState<{ code: string; ok: boolean } | null>(null);

  const dirty = editing && JSON.stringify(form) !== JSON.stringify(base.values);
  useUnsavedChanges(`section-${section}`, dirty);

  const codeLocked = !!values.code; // 고객사 코드는 입력 후 변경 불가

  const startEdit = () => {
    setForm({ ...values, wifiPassword: "", wifiPasswordClear: "" });
    setBase({ values: { ...values, wifiPassword: "", wifiPasswordClear: "" }, version });
    setErrors({});
    setMessage(undefined);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setErrors({});
    setMessage(undefined);
  };

  const save = () => {
    startTransition(async () => {
      const result = await updateCustomerSection(customerId, section, base.version, form);
      if (result.ok) {
        setEditing(false);
        setErrors({});
        setMessage(undefined);
        return;
      }
      if (result.conflict) return setConflict(result.conflict);
      setErrors(result.errors ?? {});
      setMessage(result.message);
    });
  };

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const onCodeChange = (raw: string) => {
    const code = raw.toLowerCase();
    set("code", code);
    const c = code.trim();
    if (!c || !CODE_RE.test(c)) return;
    setTimeout(async () => {
      const ok = await checkCodeAvailable(c);
      setCodeCheck({ code: c, ok });
    }, 0);
  };

  const reveal = async () => {
    const r = await revealWifiPassword(customerId);
    if (r.ok) setRevealed(r.value ?? "");
    return r.value;
  };

  // 충돌 모달 행: 다른 사람이 바꾼 항목의 최신값 / 내 입력값
  const conflictRows: ConflictRow[] = conflict
    ? SECTIONS[section].fields
        .filter((f) => f.kind !== "secret" && (conflict.latest[f.key] ?? "") !== (base.values[f.key] ?? ""))
        .map((f) => ({
          label: f.label,
          latest: displayValue(f, conflict.latest[f.key] ?? "", owners),
          mine: displayValue(f, form[f.key] ?? "", owners),
        }))
    : [];

  const renderInput = (f: FieldDef) => {
    const v = form[f.key] ?? "";
    const invalid = !!errors[f.key];
    switch (f.kind) {
      case "textarea":
        return <textarea className={textareaClass} rows={3} value={v} onChange={(e) => set(f.key, e.target.value)} />;
      case "select":
        return (
          <select className={selectClass} value={v} onChange={(e) => set(f.key, e.target.value)} aria-invalid={invalid}>
            <option value="">선택</option>
            {Object.entries(f.options ?? {}).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        );
      case "owner":
        return (
          <select className={selectClass} value={v} onChange={(e) => set(f.key, e.target.value)} aria-invalid={invalid}>
            <option value="">선택</option>
            {owners
              .filter((o) => o.isActive || o.id === v)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.isActive ? o.name : `(비활성) ${o.name}`}
                </option>
              ))}
          </select>
        );
      case "yesno":
        return (
          <select className={selectClass} value={v} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">선택</option>
            <option value="yes">{f.yesNo![0]}</option>
            <option value="no">{f.yesNo![1]}</option>
          </select>
        );
      case "secret":
        return (
          <div className="flex flex-col gap-1.5">
            <Input
              type="password"
              autoComplete="new-password"
              value={v}
              disabled={form.wifiPasswordClear === "yes"}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={hasWifiPassword ? "변경할 때만 입력" : ""}
            />
            {hasWifiPassword && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={form.wifiPasswordClear === "yes"}
                  onChange={(e) => {
                    set("wifiPasswordClear", e.target.checked ? "yes" : "");
                    if (e.target.checked) set(f.key, "");
                  }}
                />
                저장된 비밀번호 삭제
              </label>
            )}
          </div>
        );
      case "code":
        return codeLocked ? (
          <Input value={v} disabled />
        ) : (
          <Input value={v} onChange={(e) => onCodeChange(e.target.value)} placeholder={f.placeholder} aria-invalid={invalid} />
        );
      default:
        return (
          <Input
            type={f.kind === "email" ? "email" : f.kind === "url" ? "url" : "text"}
            inputMode={f.kind === "int" ? "numeric" : undefined}
            value={v}
            onChange={(e) => set(f.key, e.target.value)}
            placeholder={f.placeholder}
            aria-invalid={invalid}
          />
        );
    }
  };

  const codeHint = (() => {
    if (codeLocked) return undefined;
    const c = (form.code ?? "").trim();
    if (!c) return undefined;
    if (!CODE_RE.test(c)) return <span className="text-xs text-destructive">영문 소문자와 숫자만 사용할 수 있습니다</span>;
    if (codeCheck?.code !== c) return <span className="text-xs text-muted-foreground">확인 중…</span>;
    return codeCheck.ok ? (
      <span className="flex items-center gap-1 text-xs text-emerald-700">
        <Check className="size-3" /> 사용 가능 · 저장 후에는 변경할 수 없습니다
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <X className="size-3" /> 이미 사용 중인 코드입니다
      </span>
    );
  })();

  const renderView = (f: FieldDef) => {
    if (f.kind === "secret") {
      if (!hasWifiPassword) return <span className="text-muted-foreground">-</span>;
      return (
        <span className="flex items-center gap-1">
          <span className="font-mono">{revealed ?? "••••••"}</span>
          <button
            type="button"
            title={revealed ? "숨기기" : "보기 (조회 기록이 남습니다)"}
            onClick={() => (revealed ? setRevealed(null) : reveal())}
            className="inline-flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <CopyButton getText={() => (revealed ? Promise.resolve(revealed) : reveal())} label="비밀번호 복사" />
        </span>
      );
    }
    const text = displayValue(f, values[f.key] ?? "", owners);
    if (f.kind === "url" && /^https?:\/\//i.test(values[f.key] ?? "")) {
      return (
        <a href={values[f.key]} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">
          {text}
        </a>
      );
    }
    const owner = f.kind === "owner" ? owners.find((o) => o.id === values[f.key]) : undefined;
    return (
      <span className={cn("break-words whitespace-pre-wrap", text === "-" && "text-muted-foreground")}>
        {owner && !owner.isActive ? `(비활성) ${text}` : text}
      </span>
    );
  };

  return (
    <section id={`section-${section}`} className="scroll-mt-20 rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="font-semibold">{title}</h3>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={startEdit}>
            <Pencil />
            수정
          </Button>
        )}
      </div>

      {editing ? (
        <div className="px-5 py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {visibleFields(section, form).map((f) => (
              <Field
                key={f.key}
                label={f.label}
                required={f.required}
                error={errors[f.key]}
                hint={f.kind === "code" ? codeHint : undefined}
                className={cn(f.wide && "md:col-span-2")}
              >
                {renderInput(f)}
              </Field>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            {message && <p className="mr-auto text-sm text-destructive">{message}</p>}
            <Button variant="outline" onClick={cancel} disabled={pending}>
              취소
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              저장
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 py-4 text-sm md:grid-cols-2">
          {visibleFields(section, values).map((f) => (
            <div key={f.key} className={cn("flex gap-3", f.wide && "md:col-span-2")}>
              <dt className="w-32 shrink-0 text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 flex-1">{renderView(f)}</dd>
            </div>
          ))}
        </dl>
      )}

      <ConflictDialog
        conflict={conflict}
        rows={conflictRows}
        onCancel={() => {
          setConflict(null);
          setEditing(false);
        }}
        onReedit={() => {
          if (!conflict) return;
          const latest = { ...conflict.latest, wifiPassword: "", wifiPasswordClear: "" };
          setForm(latest);
          setBase({ values: latest, version: conflict.version });
          setErrors({});
          setMessage(undefined);
          setConflict(null);
        }}
      />
    </section>
  );
}
