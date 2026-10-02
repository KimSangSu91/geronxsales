"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeMyPassword, updateMyPhone } from "./actions";

export function PhoneForm({ initial }: { initial: string }) {
  const [phone, setPhone] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input className="max-w-52" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" aria-invalid={!!error} />
        <Button
          variant="outline"
          disabled={pending || phone === initial}
          onClick={() =>
            startTransition(async () => {
              const r = await updateMyPhone(phone);
              if (r.ok) {
                setError(undefined);
                toast.success("연락처를 저장했습니다");
              } else setError(r.errors.phone);
            })
          }
        >
          저장
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

const EMPTY = { current: "", next: "", confirm: "" };

export function PasswordForm() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <Field label="현재 비밀번호" error={errors.current}>
        <Input type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} aria-invalid={!!errors.current} />
      </Field>
      <Field label="새 비밀번호 (8자 이상)" error={errors.next}>
        <Input type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} aria-invalid={!!errors.next} />
      </Field>
      <Field label="새 비밀번호 확인" error={errors.confirm}>
        <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} aria-invalid={!!errors.confirm} />
      </Field>
      <div>
        <Button
          disabled={pending || !form.current || !form.next}
          onClick={() =>
            startTransition(async () => {
              const r = await changeMyPassword(form);
              if (r.ok) {
                setForm(EMPTY);
                setErrors({});
                toast.success("비밀번호를 변경했습니다");
              } else setErrors(r.errors);
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          변경
        </Button>
      </div>
    </div>
  );
}
