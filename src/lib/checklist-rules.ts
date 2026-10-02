// 체크리스트 규칙 — 화면·서버 공용 (기능정의서 4-5-2, 화면정의서 4-4)
import { isDateString } from "@/lib/date";

export const MISSING_REASONS = ["분실", "파손", "기타"] as const;

export type RecoveryLineInput = {
  id: string;
  providedQty: string;
  recoveredQty: string;
  missingReason: string; // "분실" | "파손" | "기타: 내용" | ""
};

export type RecoveryInput = { recoveredOn: string; lines: RecoveryLineInput[] };

const isQty = (v: string) => /^\d+$/.test(v.trim()) && Number(v) <= 100000;

// 회수 내역 입력 형식 검사 (저장 시)
export function recoveryErrors(input: RecoveryInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.recoveredOn && !isDateString(input.recoveredOn)) errors.recoveredOn = "회수일을 다시 선택하세요.";
  for (const l of input.lines) {
    if (!isQty(l.providedQty)) errors[`${l.id}.providedQty`] = "0 이상의 숫자";
    if (!isQty(l.recoveredQty)) errors[`${l.id}.recoveredQty`] = "0 이상의 숫자";
    else if (isQty(l.providedQty) && Number(l.recoveredQty) > Number(l.providedQty))
      errors[`${l.id}.recoveredQty`] = "제공 수량보다 많음";
    if (l.missingReason === "기타" || l.missingReason === "기타: ")
      errors[`${l.id}.missingReason`] = "기타 사유를 입력하세요";
  }
  return errors;
}

// '장비 회수' 항목을 완료 체크할 수 있는지: 회수일 입력 + 덜 회수된 기기는 미회수 사유 입력
export function recoveryIncompleteReason(r: {
  recoveredOn: string | null;
  lines: { providedQty: number; recoveredQty: number; missingReason: string | null }[];
}): string | null {
  if (!r.recoveredOn) return "회수 내역에서 회수일을 입력하세요.";
  const short = r.lines.some((l) => l.recoveredQty < l.providedQty && !l.missingReason?.trim());
  if (short) return "제공 수량보다 적게 회수된 기기의 미회수 사유를 입력하세요.";
  return null;
}
