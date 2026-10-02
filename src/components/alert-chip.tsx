import { CircleAlert, Info } from "lucide-react";
import type { AlertLevel, AlertType } from "@/generated/prisma/enums";
import { ALERT_TYPE_LABEL, LEVEL_TONE } from "@/lib/alert-info";
import { cn } from "@/lib/utils";

// 알림 배지 (Alert 표 기준): 빨강 ! / 주황 ! / 회색 i
const TONE = {
  red: "border-red-200 bg-red-50 text-red-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  gray: "border-zinc-200 bg-zinc-50 text-zinc-600",
} as const;

export function AlertChip({
  type,
  level,
  compact,
  title,
}: {
  type: AlertType;
  level: AlertLevel;
  compact?: boolean; // 아이콘만 (마우스를 올리면 내용)
  title?: string;
}) {
  const tone = LEVEL_TONE[level];
  const Icon = tone === "gray" ? Info : CircleAlert;
  return (
    <span
      title={title ?? ALERT_TYPE_LABEL[type]}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border text-xs font-medium whitespace-nowrap",
        compact ? "p-0.5" : "px-2 py-0.5",
        TONE[tone],
      )}
    >
      <Icon className="size-3.5" />
      {!compact && ALERT_TYPE_LABEL[type]}
    </span>
  );
}
