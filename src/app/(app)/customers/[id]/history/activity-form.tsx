"use client";

import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import { selectClass, textareaClass } from "@/components/form";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import type { FieldErrors } from "@/lib/customer-input";
import { validateActivity, type ActivityInput } from "@/lib/history-input";
import { ACTIVITY_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; errors?: FieldErrors; message?: string };

// 수동 기록 입력 폼 — 우측 패널(compact)·히스토리 탭·기록 수정에서 공용
export function ActivityForm({
  initial,
  submitLabel = "기록",
  rows = 3,
  compact,
  onSubmit,
  onCancel,
  resetAfterSubmit = true,
}: {
  initial: ActivityInput;
  submitLabel?: string;
  rows?: number;
  compact?: boolean;
  onSubmit: (input: ActivityInput) => Promise<Result>;
  onCancel?: () => void;
  resetAfterSubmit?: boolean;
}) {
  const [form, setForm] = useState<ActivityInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const key = useId();

  // 내용을 쓰다가 다른 곳으로 이동하면 확인
  useUnsavedChanges(`activity-${key}`, form.content.trim() !== initial.content.trim());

  const submit = () => {
    const found = validateActivity(form);
    setErrors(found);
    if (Object.keys(found).length) return setMessage(undefined);
    startTransition(async () => {
      const r = await onSubmit(form);
      if (r.ok) {
        setErrors({});
        setMessage(undefined);
        if (resetAfterSubmit) setForm({ ...initial, activityType: form.activityType, content: "" });
        return;
      }
      setErrors(r.errors ?? {});
      setMessage(r.message);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={cn("flex gap-2", compact && "flex-col")}>
        <select
          className={cn(selectClass, !compact && "w-32")}
          value={form.activityType}
          onChange={(e) => setForm({ ...form, activityType: e.target.value as ActivityInput["activityType"] })}
          aria-invalid={!!errors.activityType}
          aria-label="유형"
        >
          <option value="">유형 선택</option>
          {Object.entries(ACTIVITY_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <DatePicker
          className={cn(!compact && "w-44")}
          value={form.occurredOn || undefined}
          onChange={(v) => setForm({ ...form, occurredOn: v ?? "" })}
          clearable={false}
        />
      </div>
      <textarea
        className={textareaClass}
        rows={rows}
        value={form.content}
        onChange={(e) => setForm({ ...form, content: e.target.value })}
        placeholder="통화·미팅 내용 등을 기록하세요"
        aria-invalid={!!errors.content}
        aria-label="내용"
      />
      {(message || Object.keys(errors).length > 0) && (
        <p className="text-xs text-destructive">
          {message ?? errors.activityType ?? errors.occurredOn ?? errors.content}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            취소
          </Button>
        )}
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
