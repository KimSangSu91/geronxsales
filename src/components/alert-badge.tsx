import Link from "next/link";
import { CircleAlert, Info } from "lucide-react";
import { BADGE_INFO, type BadgeKind } from "@/lib/renewal";
import { cn } from "@/lib/utils";

// 알림 배지 (화면정의서 7장): 빨강 ! 경과·미승인 / 주황 ! 확인 필요·임박 / 회색 i 안내
const TONE = {
  red: "border-red-200 bg-red-50 text-red-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  gray: "border-zinc-200 bg-zinc-50 text-zinc-600",
} as const;

export function AlertBadge({
  kind,
  onClick,
  href,
  compact,
}: {
  kind: BadgeKind;
  onClick?: () => void;
  href?: string;
  compact?: boolean; // 리스트: 아이콘만 (마우스를 올리면 내용)
}) {
  const info = BADGE_INFO[kind];
  const Icon = info.tone === "gray" ? Info : CircleAlert;
  const cls = cn(
    "inline-flex shrink-0 items-center gap-1 rounded-full border text-xs font-medium whitespace-nowrap",
    compact ? "p-0.5" : "px-2 py-0.5",
    TONE[info.tone],
    (onClick || href) && "hover:opacity-80",
  );
  const body = (
    <>
      <Icon className="size-3.5" />
      {!compact && info.label}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} title={info.label} onClick={(e) => e.stopPropagation()}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} title={info.label} onClick={onClick}>
        {body}
      </button>
    );
  }
  return (
    <span className={cls} title={info.label}>
      {body}
    </span>
  );
}
