"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-input";
import { formatDateTimeKst } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { tempPassword } from "@/lib/temp-password";

type Fail = { ok: false; message: string; errors?: Record<string, string> };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 사용자 추가 (기능정의서 4-13): 계정 생성 + 임시 비밀번호 1회 표시
export async function createUser(input: {
  email: string;
  name: string;
  phone: string;
  role: UserRole;
}): Promise<{ ok: true; password: string } | Fail> {
  await requireAdmin();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const errors: Record<string, string> = {};
  if (!EMAIL_RE.test(email)) errors.email = "이메일 형식을 확인하세요.";
  if (!name) errors.name = "이름을 입력하세요.";
  if (input.phone.trim() && !/^[\d-]{9,13}$/.test(input.phone.trim())) errors.phone = "연락처 형식을 확인하세요.";
  if (input.role !== "ADMIN" && input.role !== "MEMBER") errors.role = "권한을 선택하세요.";
  if (Object.keys(errors).length) return { ok: false, message: "입력 내용을 확인하세요.", errors };
  if (await prisma.user.findUnique({ where: { email } })) {
    return { ok: false, message: "입력 내용을 확인하세요.", errors: { email: "이미 등록된 이메일입니다." } };
  }

  const password = tempPassword();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    const exists = /already|registered|exists/i.test(error?.message ?? "");
    return exists
      ? { ok: false, message: "입력 내용을 확인하세요.", errors: { email: "이미 로그인 계정이 있는 이메일입니다." } }
      : { ok: false, message: "계정을 만들지 못했습니다. 잠시 후 다시 시도하세요." };
  }
  try {
    await prisma.user.create({
      data: {
        id: data.user.id,
        email,
        name,
        phone: input.phone.trim() ? normalizePhone(input.phone) : null,
        role: input.role,
        mustChangePassword: true,
      },
    });
  } catch (e) {
    // 방금 만든 로그인 계정만 정리 (기존 사용자 기록과 무관)
    await admin.auth.admin.deleteUser(data.user.id);
    throw e;
  }
  revalidatePath("/settings/users");
  return { ok: true, password };
}

// 임시 비밀번호 재발급 — 비밀번호 재설정 메일 대신 (2026-10-02 결정)
export async function resetPassword(userId: string): Promise<{ ok: true; password: string } | Fail> {
  await requireAdmin();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, message: "사용자를 찾을 수 없습니다." };
  const password = tempPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, message: "비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도하세요." };
  await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
  revalidatePath("/settings/users");
  return { ok: true, password };
}

// 남는 활성 관리자가 없어지는 변경은 막음
async function wouldRemoveLastAdmin(userId: string) {
  const others = await prisma.user.count({ where: { role: "ADMIN", isActive: true, id: { not: userId } } });
  return others === 0;
}

export async function setRole(userId: string, role: UserRole): Promise<{ ok: true } | Fail> {
  const me = await requireAdmin();
  if (userId === me.id) return { ok: false, message: "본인의 권한은 바꿀 수 없습니다." };
  if (role !== "ADMIN" && role !== "MEMBER") return { ok: false, message: "권한을 다시 선택하세요." };
  if (role === "MEMBER" && (await wouldRemoveLastAdmin(userId))) return { ok: false, message: "관리자는 1명 이상 있어야 합니다." };
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/settings/users");
  return { ok: true };
}

// 비활성화 (삭제 없음) — 담당 고객사가 있으면 넘겨받을 사람에게 함께 인계 가능
export async function deactivateUser(userId: string, transferToId: string | null): Promise<{ ok: true; moved: number } | Fail> {
  const me = await requireAdmin();
  if (userId === me.id) return { ok: false, message: "본인 계정은 비활성화할 수 없습니다." };
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target?.isActive) return { ok: false, message: "이미 비활성 상태입니다." };
  if (target.role === "ADMIN" && (await wouldRemoveLastAdmin(userId))) return { ok: false, message: "관리자는 1명 이상 있어야 합니다." };
  const heir = transferToId ? await prisma.user.findUnique({ where: { id: transferToId } }) : null;
  if (transferToId && (!heir?.isActive || heir.id === userId)) return { ok: false, message: "넘겨받을 담당자를 다시 선택하세요." };

  const moved = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive: false, deactivatedAt: new Date() } });
    if (!heir) return 0;
    const owned = await tx.customer.findMany({ where: { ownerId: userId }, select: { id: true } });
    for (const c of owned) {
      await tx.customer.update({ where: { id: c.id }, data: { ownerId: heir.id, version: { increment: 1 } } });
      await recordHistory(tx, {
        customerId: c.id,
        event: "owner_changed",
        content: `내부 담당자 변경: ${target.name} → ${heir.name} (${target.name} 계정 비활성화로 인계)`,
        actorId: me.id,
      });
    }
    return owned.length;
  });
  revalidatePath("/", "layout");
  return { ok: true, moved };
}

export async function reactivateUser(userId: string): Promise<{ ok: true } | Fail> {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { isActive: true, deactivatedAt: null } });
  revalidatePath("/", "layout");
  return { ok: true };
}

// 사용자별 로그인 기록 (최근 90일, 최대 200건)
export async function userLoginLogs(userId: string) {
  await requireAdmin();
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await prisma.loginLog.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({ id: r.id, at: formatDateTimeKst(r.createdAt), success: r.success, ip: r.ip, userAgent: r.userAgent }));
}
