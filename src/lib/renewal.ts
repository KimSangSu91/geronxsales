// 갱신·체험 배지와 갱신 기간 — 화면·서버·매일 배치 공용 (기능정의서 4-5·4-5-1, 데이터모델 3-1)
// 배지는 저장하지 않고 그때그때 계산
import { addDays, addMonths } from "@/lib/date";

export type BadgeKind = "RENEWAL_DUE" | "RENEWAL_CANCELLED" | "AUTO_RENEW_UNCONFIRMED" | "TRIAL_ENDING" | "TRIAL_OVERDUE";

// 색 규칙 (화면정의서 7장): 빨강 = 경과·미승인 / 주황 = 확인 필요·임박 / 회색 = 안내
export const BADGE_INFO: Record<BadgeKind, { label: string; tone: "red" | "orange" | "gray" }> = {
  RENEWAL_DUE: { label: "갱신 확인 필요", tone: "orange" },
  RENEWAL_CANCELLED: { label: "갱신 취소됨", tone: "gray" },
  AUTO_RENEW_UNCONFIRMED: { label: "자동연장 미승인", tone: "red" },
  TRIAL_ENDING: { label: "체험 종료 확인 필요", tone: "orange" },
  TRIAL_OVERDUE: { label: "체험 기간 경과", tone: "red" },
};

export const DEFAULT_RENEWAL_DAYS = 60;
export const DEFAULT_TRIAL_END_DAYS = 7;

export type RenewalFacts = {
  endDate: string; // 'YYYY-MM-DD'
  renewalCancelled: boolean;
  autoRenewPending: boolean; // 시스템이 자동연장했고 아직 승인 전
};

// 현재 계약의 갱신 배지
export function renewalBadge(
  status: string,
  contract: RenewalFacts | null,
  today: string,
  renewalDays = DEFAULT_RENEWAL_DAYS,
): BadgeKind | null {
  if (!contract || status !== "ACTIVE") return null;
  if (contract.autoRenewPending) return "AUTO_RENEW_UNCONFIRMED";
  if (contract.renewalCancelled) return "RENEWAL_CANCELLED";
  if (contract.endDate <= addDays(today, renewalDays)) return "RENEWAL_DUE";
  return null;
}

// 진행 중인 체험의 배지: 종료 D-7부터 주황, 종료일이 지나면 빨강 (상태는 체험중 유지)
export function trialBadge(
  status: string,
  trial: { endDate: string } | null,
  today: string,
  trialDays = DEFAULT_TRIAL_END_DAYS,
): BadgeKind | null {
  if (!trial || status !== "TRIAL") return null;
  if (trial.endDate < today) return "TRIAL_OVERDUE";
  if (trial.endDate <= addDays(today, trialDays)) return "TRIAL_ENDING";
  return null;
}

// 갱신 = 종료일 연장 (새 계약을 만들지 않음): 현재 종료일 기준 n개월 뒤
// 예) 12/31 + 1년 → 다음 해 12/31, 5/27 + 1년 → 다음 해 5/27 (말일 보정)
export function extendEnd(endDate: string, months: number): string {
  return addDays(addMonths(addDays(endDate, 1), months), -1);
}

// 연장 기간이 없으면(자동연장 N 등) 계약 기간과 같은 길이(개월)로
export function contractMonths(startDate: string, endDate: string): number {
  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = addDays(endDate, 1).split("-").map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm));
}
