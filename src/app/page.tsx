import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { logout } from "./login/actions";

// 임시 홈 — 0-3 레이아웃 작업에서 대시보드로 교체
export default async function Home() {
  const user = await requireUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="text-lg">
        {user.name}님 ({user.role === "ADMIN" ? "관리자" : "일반"}) 로그인됨
      </p>
      <form action={logout}>
        <Button type="submit" variant="outline">
          로그아웃
        </Button>
      </form>
    </main>
  );
}
