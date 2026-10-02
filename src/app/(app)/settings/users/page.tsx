import { requireAdmin } from "@/lib/auth";
import { formatDateTimeKst } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { UsersTable } from "./users-table";

// 설정 > 사용자 관리 (관리자 전용, 기능정의서 4-13)
export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { ownedCustomers: true } },
      loginLogs: { where: { success: true }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const rows = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    owned: u._count.ownedCustomers,
    lastLogin: u.loginLogs[0] ? formatDateTimeKst(u.loginLogs[0].createdAt) : null,
  }));
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">사용자 관리</h1>
      <UsersTable rows={rows} meId={me.id} />
    </div>
  );
}
