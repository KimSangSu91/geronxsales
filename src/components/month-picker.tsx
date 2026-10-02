"use client";

import { useState } from "react";
import { CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// 월 선택 (청구월 등) — 값은 'YYYY-MM'
export function MonthPicker({
  value,
  onChange,
  placeholder = "월 선택",
  className,
  invalid,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(value ? Number(value.slice(0, 4)) : thisYear);
  const selected = value ? { y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) } : null;

  return (
    <div className={cn("relative", className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setYear(selected?.y ?? thisYear);
        }}
      >
        <PopoverTrigger
          aria-invalid={invalid}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm aria-invalid:border-destructive",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{value ? value.replace("-", ".") : placeholder}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setYear(year - 1)} className="rounded p-1 hover:bg-muted" aria-label="이전 해">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-medium">{year}년</span>
            <button type="button" onClick={() => setYear(year + 1)} className="rounded p-1 hover:bg-muted" aria-label="다음 해">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const active = selected?.y === year && selected.m === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onChange(`${year}-${String(m).padStart(2, "0")}`);
                    setOpen(false);
                  }}
                  className={cn("rounded-md py-1.5 text-sm", active ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {m}월
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          aria-label="월 지우기"
          onClick={() => onChange(undefined)}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
