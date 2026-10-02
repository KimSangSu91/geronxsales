// 수동 히스토리(영업 활동) 입력 검사 — 화면·서버 공용 (기능정의서 4-9)
import type { ActivityType } from "@/generated/prisma/enums";
import type { FieldErrors } from "@/lib/customer-input";
import { isDateString } from "@/lib/date";
import { ACTIVITY_TYPE_LABEL } from "@/lib/labels";

export type ActivityInput = {
  activityType: ActivityType | "";
  occurredOn: string; // 'YYYY-MM-DD'
  content: string;
};

export const CONTENT_MAX = 5000;

export function validateActivity(a: ActivityInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!a.activityType) errors.activityType = "유형을 선택하세요.";
  else if (!Object.hasOwn(ACTIVITY_TYPE_LABEL, a.activityType)) errors.activityType = "유형을 다시 선택하세요.";
  if (!a.occurredOn) errors.occurredOn = "날짜를 선택하세요.";
  else if (!isDateString(a.occurredOn)) errors.occurredOn = "날짜를 다시 선택하세요.";
  if (!a.content.trim()) errors.content = "내용을 입력하세요.";
  else if (a.content.length > CONTENT_MAX) errors.content = `내용은 ${CONTENT_MAX.toLocaleString()}자까지 입력할 수 있습니다.`;
  return errors;
}
