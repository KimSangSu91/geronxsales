"use client";

import { useRouter } from "next/navigation";
import { selectClass } from "@/components/form";
import { cn } from "@/lib/utils";

// 수신 경로별 보기 (구글폼 경로 / 직접 등록)
export function SourceFilter({ value, sources, baseHref }: { value: string; sources: { id: string; name: string }[]; baseHref: string }) {
  const router = useRouter();
  return (
    <select
      className={cn(selectClass, "w-52")}
      value={value}
      aria-label="수신 경로"
      onChange={(e) => {
        const v = e.target.value;
        router.push(v ? `${baseHref}${baseHref.includes("?") ? "&" : "?"}source=${encodeURIComponent(v)}` : baseHref);
      }}
    >
      <option value="">전체 경로</option>
      {sources.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value="manual">직접 등록</option>
    </select>
  );
}
