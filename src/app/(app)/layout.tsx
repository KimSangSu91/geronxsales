import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NavMenu } from "@/components/layout/nav-menu";
import { UserMenu } from "@/components/layout/user-menu";

// 로그인 후 모든 화면의 공통 틀: 왼쪽 메뉴 + 상단 헤더
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

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
          {/* 🔔 알림 모달은 3단계(알림)에서 구현 */}
          <button
            type="button"
            disabled
            title="알림 (3단계에서 구현)"
            className="rounded-md p-2 text-muted-foreground disabled:opacity-60"
          >
            <Bell className="size-5" />
            <span className="sr-only">알림</span>
          </button>
          <UserMenu name={user.name} email={user.email} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
