import Link from "next/link";
import { syncAlertsIfStale } from "@/lib/alerts";
import { requireUser } from "@/lib/auth";
import { ensureMonthlyInvoicesIfStale } from "@/lib/invoice";
import { prisma } from "@/lib/prisma";
import { AlertBell } from "@/components/layout/alert-bell";
import { NavMenu } from "@/components/layout/nav-menu";
import { UserMenu } from "@/components/layout/user-menu";

// 로그인 후 모든 화면의 공통 틀: 왼쪽 메뉴 + 상단 헤더
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // 새 알림 = 내가 마지막으로 🔔를 연 뒤 생긴 해제 안 된 알림 (사용자별)
  await ensureMonthlyInvoicesIfStale();
  await syncAlertsIfStale();
  const hasNewAlert =
    (await prisma.alert.count({
      where: { resolvedAt: null, ...(user.alertsSeenAt && { createdAt: { gt: user.alertsSeenAt } }) },
    })) > 0;

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r bg-sidebar">
        <Link href="/" className="flex h-14 items-center border-b px-5 font-semibold">
          늘케어 고객관리
        </Link>
        <div className="flex-1 overflow-y-auto">
          <NavMenu isAdmin={user.role === "ADMIN"} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-2 border-b bg-background px-6">
          <AlertBell hasNew={hasNewAlert} />
          <UserMenu name={user.name} email={user.email} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
