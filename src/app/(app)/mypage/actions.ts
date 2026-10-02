"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-input";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { PASSWORD_MIN } from "@/lib/temp-password";

type Result = { ok: true } | { ok: false; errors: Record<string, string> };

// 내 정보: 연락처만 수정 (이메일·이름·권한은 기록 보존을 위해 변경 불가)
export async function updateMyPhone(phone: string): Promise<Result> {
  const me = await requireUser();
  const v = phone.trim();
  if (v && !/^[\d-]{9,13}$/.test(v)) return { ok: false, errors: { phone: "연락처 형식을 확인하세요." } };
  await prisma.user.update({ where: { id: me.id }, data: { phone: v ? normalizePhone(v) : null } });
  revalidatePath("/mypage");
  return { ok: true };
}

export async function changeMyPassword(input: { current: string; next: string; confirm: string }): Promise<Result> {
  const me = await requireUser();
  const errors: Record<string, string> = {};
  if (!input.current) errors.current = "현재 비밀번호를 입력하세요.";
  if (input.next.length < PASSWORD_MIN) errors.next = `${PASSWORD_MIN}자 이상 입력하세요.`;
  else if (input.next === input.current) errors.next = "현재 비밀번호와 다르게 정하세요.";
  if (input.next !== input.confirm) errors.confirm = "새 비밀번호가 서로 다릅니다.";
  if (Object.keys(errors).length) return { ok: false, errors };

  // 현재 비밀번호 확인 — 로그인 쿠키에 영향 없는 별도 클라이언트로 검사
  const probe = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: wrong } = await probe.auth.signInWithPassword({ email: me.email, password: input.current });
  if (wrong) return { ok: false, errors: { current: "현재 비밀번호가 올바르지 않습니다." } };

  const { error } = await createAdminClient().auth.admin.updateUserById(me.id, { password: input.next });
  if (error) return { ok: false, errors: { next: "비밀번호를 바꾸지 못했습니다. 다른 비밀번호로 시도하세요." } };
  await prisma.user.update({ where: { id: me.id }, data: { mustChangePassword: false } });
  revalidatePath("/", "layout");
  return { ok: true };
}
