"use server";

import { revalidatePath } from "next/cache";
import { syncAlerts } from "@/lib/alerts";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALERT_SETTINGS } from "@/lib/settings";

// 알림 기준 저장 (관리자·일반 모두 가능 — 기능정의서 2장) → 알림을 새 기준으로 바로 다시 계산
export async function saveAlertSettings(values: Record<string, string>): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  await requireUser();
  const errors: Record<string, string> = {};
  const parsed: Record<string, number> = {};
  for (const s of ALERT_SETTINGS) {
    const v = (values[s.key] ?? "").trim();
    if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 365) errors[s.key] = "1~365 사이 숫자";
    else parsed[s.key] = Number(v);
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  await prisma.$transaction(
    ALERT_SETTINGS.map((s) =>
      prisma.setting.upsert({ where: { key: s.key }, create: { key: s.key, value: parsed[s.key] }, update: { value: parsed[s.key] } }),
    ),
  );
  await syncAlerts();
  revalidatePath("/", "layout");
  return { ok: true };
}
