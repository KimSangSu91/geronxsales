// 알림 종류·색 — 화면·서버 공용 (기능정의서 4-10, 화면정의서 7장 색 규칙)
import type { AlertLevel, AlertType } from "@/generated/prisma/enums";

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  RENEWAL_CHECK: "갱신 확인 필요",
  RENEWAL_CANCELLED: "갱신 취소 예정",
  AUTO_RENEWED_UNCONFIRMED: "자동연장 미승인",
  PENDING_STALE: "진행대기 장기",
  TRIAL_ENDING: "체험 종료 확인 필요",
  ONBOARDING_DELAYED: "도입 지연",
  RECOVERY_INCOMPLETE: "장비 미회수",
  INQUIRY_UNHANDLED: "미처리 문의",
  INVOICE_UNBILLED: "청구 미처리",
  INVOICE_UNPAID: "미납",
  OWNER_INACTIVE: "담당자 재배정 필요",
};

export const ALERT_TYPES = Object.keys(ALERT_TYPE_LABEL) as AlertType[];

// 빨강 = 경과·미승인·미납·미회수 / 주황 = 임박·확인 필요 / 회색 = 안내
export const LEVEL_TONE: Record<AlertLevel, "red" | "orange" | "gray"> = {
  DANGER: "red",
  WARNING: "orange",
  INFO: "gray",
};

// 심각도 정렬 (빨강 → 주황 → 회색)
export const LEVEL_ORDER: Record<AlertLevel, number> = { DANGER: 0, WARNING: 1, INFO: 2 };

// 화면에 보내는 알림 1건
export type AlertView = {
  id: string;
  type: AlertType;
  level: AlertLevel;
  customerId: string | null;
  customerName: string | null;
  message: string;
  createdAt: string; // ISO
};

// 알림 → 이동할 화면
export function alertHref(a: { type: AlertType; customerId: string | null }): string {
  if (!a.customerId) return a.type === "INQUIRY_UNHANDLED" ? "/inbound" : "/";
  const base = `/customers/${a.customerId}`;
  switch (a.type) {
    case "RENEWAL_CHECK":
    case "RENEWAL_CANCELLED":
    case "AUTO_RENEWED_UNCONFIRMED":
      return `${base}?tab=contract&open=renewal`;
    case "TRIAL_ENDING":
      return `${base}?tab=contract&open=trial`;
    case "ONBOARDING_DELAYED":
    case "RECOVERY_INCOMPLETE":
      return `${base}?tab=checklist`;
    case "INVOICE_UNBILLED":
    case "INVOICE_UNPAID":
      return `${base}?tab=billing`;
    case "OWNER_INACTIVE":
      return `${base}?tab=info&edit=basic`;
    default:
      return base;
  }
}
