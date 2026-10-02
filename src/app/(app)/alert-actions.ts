"use server";

import type { AlertView } from "@/lib/alert-info";
import { loadOpenAlerts, syncAlerts } from "@/lib/alerts";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 🔔 열기: 최신 조건으로 알림을 맞춘 뒤 목록 반환 + 이 사용자는 지금까지 알림을 확인한 것으로 기록
export async function openAlerts(): Promise<{ alerts: AlertView[]; seenBefore: string | null }> {
  const user = await requireUser();
  await syncAlerts();
  const alerts = await loadOpenAlerts();
  await prisma.user.update({ where: { id: user.id }, data: { alertsSeenAt: new Date() } });
  return { alerts, seenBefore: user.alertsSeenAt?.toISOString() ?? null };
}
