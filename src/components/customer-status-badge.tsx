import type { CustomerStatus } from "@/generated/prisma/enums";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

// 상태 배지 색: 진행 단계는 파랑 계열, 사용중은 초록, 종료 계열은 회색
const COLOR: Record<CustomerStatus, string> = {
  INQUIRY: "bg-slate-100 text-slate-700",
  PENDING: "bg-indigo-50 text-indigo-700",
  ONBOARDING: "bg-sky-50 text-sky-700",
  TRIAL: "bg-violet-50 text-violet-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ENDED: "bg-zinc-100 text-zinc-500",
  TERMINATED: "bg-zinc-100 text-zinc-500",
  NOT_CONVERTED: "bg-zinc-100 text-zinc-500",
  OTHER: "bg-zinc-100 text-zinc-600",
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        COLOR[status],
      )}
    >
      {CUSTOMER_STATUS_LABEL[status]}
    </span>
  );
}
