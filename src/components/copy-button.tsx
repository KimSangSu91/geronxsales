"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export async function copyText(text: string, label = "복사했습니다") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("복사하지 못했습니다. 직접 선택해서 복사하세요.");
  }
}

// 값을 클립보드로 복사. getText를 주면 누를 때 값을 가져옴(비밀번호 조회 등)
export function CopyButton({
  text,
  getText,
  label = "복사",
  className,
}: {
  text?: string;
  getText?: () => Promise<string | undefined>;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={async (e) => {
        e.stopPropagation();
        const value = getText ? await getText() : text;
        if (value) await copyText(value);
      }}
      className={cn("inline-flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground", className)}
    >
      <Copy className="size-3.5" />
    </button>
  );
}
