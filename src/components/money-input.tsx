"use client";

import { Input } from "@/components/ui/input";
import { parseAmount } from "@/lib/contract-input";
import { formatWon, withVat } from "@/lib/money";

// 공급가 입력: 천 단위 쉼표 자동, 아래에 VAT 포함 금액 안내
export function MoneyInput({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const n = parseAmount(value);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Input
          inputMode="numeric"
          value={value}
          disabled={disabled}
          aria-invalid={invalid}
          placeholder="공급가"
          className="pr-7 text-right tabular-nums"
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            onChange(digits ? formatWon(Number(digits)) : "");
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">원</span>
      </div>
      {!disabled && !Number.isNaN(n) && n > 0 && (
        <span className="text-right text-xs text-muted-foreground tabular-nums">VAT 포함 {formatWon(withVat(n))}원</span>
      )}
    </div>
  );
}
