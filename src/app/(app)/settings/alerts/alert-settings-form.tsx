"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { saveAlertSettings } from "./actions";

type Item = { key: string; label: string; hint: string; value: number; fallback: number };

export function AlertSettingsForm({ items }: { items: Item[] }) {
  const initial = Object.fromEntries(items.map((i) => [i.key, String(i.value)]));
  const [form, setForm] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedChanges("alert-settings", dirty);

  return (
    <section className="max-w-2xl rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/30">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pl-5 font-medium">알림</th>
            <th className="py-2 font-medium">기준</th>
            <th className="py-2 pr-5 font-medium">일수</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.key} className="border-b last:border-0">
              <td className="py-2.5 pl-5 font-medium">{i.label}</td>
              <td className="py-2.5 text-muted-foreground">
                {i.hint} <span className="text-xs">(기본 {i.fallback}일)</span>
              </td>
              <td className="py-2.5 pr-5">
                <div className="flex items-center gap-1">
                  <Input
                    inputMode="numeric"
                    className="h-8 w-20"
                    value={form[i.key]}
                    onChange={(e) => setForm({ ...form, [i.key]: e.target.value })}
                    aria-invalid={!!errors[i.key]}
                  />
                  <span className="text-muted-foreground">일</span>
                </div>
                {errors[i.key] && <span className="text-xs text-destructive">{errors[i.key]}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-end border-t px-5 py-3">
        <Button
          disabled={!dirty || pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveAlertSettings(form);
              if (r.ok) {
                setErrors({});
                toast.success("알림 기준을 저장했습니다 · 알림을 새 기준으로 다시 계산했습니다");
              } else setErrors(r.errors);
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          저장
        </Button>
      </div>
    </section>
  );
}
