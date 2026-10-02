// 서비스 계정(늘케어 발급 계정) 입력값 검사 — 화면·서버 공용 (기능정의서 4-3-1)
import type { AccountStatus, AccountType } from "@/generated/prisma/enums";
import { isDateString } from "@/lib/date";
import { ACCOUNT_STATUS_LABEL, ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import type { FieldErrors } from "@/lib/customer-input";

export type AccountInput = {
  loginId: string;
  type: AccountType | "";
  typeOther: string;
  userName: string;
  issuedOn: string; // 'YYYY-MM-DD' 또는 ""
  status: AccountStatus;
  deactivatedOn: string;
  password: string; // 새 비밀번호 (수정 시 비우면 변경 없음)
  passwordClear: boolean; // 저장된 비밀번호 삭제
  memo: string;
};

export const emptyAccount = (): AccountInput => ({
  loginId: "",
  type: "",
  typeOther: "",
  userName: "",
  issuedOn: "",
  status: "IN_USE",
  deactivatedOn: "",
  password: "",
  passwordClear: false,
  memo: "",
});

export function validateAccount(a: AccountInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!a.loginId.trim()) errors.loginId = "계정 ID를 입력하세요.";
  else if (/\s/.test(a.loginId.trim())) errors.loginId = "계정 ID에 공백을 넣을 수 없습니다.";
  if (!a.type) errors.type = "계정 유형을 선택하세요.";
  else if (!Object.hasOwn(ACCOUNT_TYPE_LABEL, a.type)) errors.type = "계정 유형을 다시 선택하세요.";
  else if (a.type === "OTHER" && !a.typeOther.trim()) errors.typeOther = "유형을 직접 입력하세요.";
  if (!Object.hasOwn(ACCOUNT_STATUS_LABEL, a.status)) errors.status = "상태를 다시 선택하세요.";
  if (a.issuedOn && !isDateString(a.issuedOn)) errors.issuedOn = "날짜를 다시 선택하세요.";
  if (a.deactivatedOn && !isDateString(a.deactivatedOn)) errors.deactivatedOn = "날짜를 다시 선택하세요.";
  return errors;
}
