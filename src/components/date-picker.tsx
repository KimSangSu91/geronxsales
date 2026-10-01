"use client";

import { useState } from "react";
import { ko } from "react-day-picker/locale";
import { CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";

// 날짜 입력은 항상 이 컴포넌트 사용. 값은 'YYYY-MM-DD' 문자열 (달력 표시용 Date는 내부에서만 사용)

function parse(value?: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function format(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type Props = {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  name?: string; // form 전송용 hidden input
  className?: string;
  clearable?: boolean;
};

export function DatePicker({
  value,
  onChange,
  placeholder = "날짜 선택",
  name,
  className,
  clearable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = parse(value);

  return (
    <div className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{value ? formatDate(value) : placeholder}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={ko}
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            onSelect={(date) => {
              onChange(date ? format(date) : undefined);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && value && (
        <button
          type="button"
          aria-label="날짜 지우기"
          onClick={() => onChange(undefined)}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
