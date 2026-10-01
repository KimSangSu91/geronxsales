"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string } | undefined;

async function writeLoginLog(email: string, success: boolean, userId: string | null) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
  await prisma.loginLog.create({
    data: { email, success, userId, ip, userAgent: h.get("user-agent") },
  });
}

// 로그인은 로그인 전에 호출되므로 requireUser 대상이 아님
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력하세요.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    const known = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    await writeLoginLog(email, false, known?.id ?? null);
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다.", email };
  }

  const user = await prisma.user.findUnique({ where: { id: data.user.id } });
  if (!user || !user.isActive) {
    await supabase.auth.signOut();
    await writeLoginLog(email, false, user?.id ?? null);
    return {
      error: user
        ? "비활성화된 계정입니다. 관리자에게 문의하세요."
        : "등록되지 않은 계정입니다. 관리자에게 문의하세요.",
      email,
    };
  }

  await writeLoginLog(email, true, user.id);
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
