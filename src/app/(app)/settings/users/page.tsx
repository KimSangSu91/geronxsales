import { ComingSoon } from "@/components/layout/coming-soon";
import { requireAdmin } from "@/lib/auth";

export default async function UsersPage() {
  await requireAdmin();
  return <ComingSoon title="사용자 관리" stage="4단계" />;
}
