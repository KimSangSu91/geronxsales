import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_RENEWAL_DAYS, DEFAULT_TRIAL_END_DAYS } from "@/lib/renewal";

// 알림 기준 (설정 > 알림 기준) — key·기본값 (기능정의서 4-10)
export const ALERT_SETTINGS = [
  { key: "alert.renewal_days", label: "갱신 확인 필요", hint: "계약 종료일 며칠 전부터", fallback: DEFAULT_RENEWAL_DAYS },
  { key: "alert.pending_stale_days", label: "진행대기 장기 체류", hint: "마지막 활동 후 며칠", fallback: 14 },
  { key: "alert.trial_end_days", label: "체험 종료 확인 필요", hint: "체험 종료일 며칠 전부터", fallback: DEFAULT_TRIAL_END_DAYS },
  { key: "alert.recovery_days", label: "장비 미회수", hint: "회수·종료 체크리스트 생성 후 며칠", fallback: 14 },
  { key: "alert.inquiry_days", label: "미처리 문의", hint: "접수 후 며칠", fallback: 3 },
  { key: "alert.invoice_days", label: "청구 미처리", hint: "고객사 청구일 후 며칠까지 세금계산서 미업로드", fallback: 5 },
] as const;

export type AlertSettingKey = (typeof ALERT_SETTINGS)[number]["key"];

// 설정값(Setting 표) 읽기 — 없거나 형식이 다르면 기본값
export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return typeof s?.value === "number" ? s.value : fallback;
}

// 알림 기준 일수 전체
export async function getAlertSettings(): Promise<Record<AlertSettingKey, number>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: ALERT_SETTINGS.map((s) => s.key) } } });
  return Object.fromEntries(
    ALERT_SETTINGS.map((s) => {
      const v = rows.find((r) => r.key === s.key)?.value;
      return [s.key, typeof v === "number" ? v : s.fallback];
    }),
  ) as Record<AlertSettingKey, number>;
}

// 갱신·체험 배지용 (상세·리스트)
export async function getAlertDays() {
  const s = await getAlertSettings();
  return { renewal: s["alert.renewal_days"], trial: s["alert.trial_end_days"] };
}
