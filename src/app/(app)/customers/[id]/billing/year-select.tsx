"use client";

import { useRouter } from "next/navigation";
import { selectClass } from "@/components/form";
import { cn } from "@/lib/utils";

// 청구 탭 연도 선택 — 바꾸면 주소(?year=)를 바꿔 다시 불러옴
export function YearSelect({ base, year, years }: { base: string; year: number; years: number[] }) {
  const router = useRouter();
  return (
    <select
      className={cn(selectClass, "w-28")}
      value={year}
      onChange={(e) => router.push(`${base}&year=${e.target.value}`, { scroll: false })}
      aria-label="연도 선택"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}년
        </option>
      ))}
    </select>
  );
}
