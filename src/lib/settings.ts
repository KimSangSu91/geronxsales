import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_RENEWAL_DAYS, DEFAULT_TRIAL_END_DAYS } from "@/lib/renewal";

// 설정값(Setting 표) 읽기 — 없거나 형식이 다르면 기본값
export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return typeof s?.value === "number" ? s.value : fallback;
}

// 알림 기준 일수 (설정 > 알림 기준)
export async function getAlertDays() {
  const [renewal, trial] = await Promise.all([
    getNumberSetting("alert.renewal_days", DEFAULT_RENEWAL_DAYS),
    getNumberSetting("alert.trial_end_days", DEFAULT_TRIAL_END_DAYS),
  ]);
  return { renewal, trial };
}
