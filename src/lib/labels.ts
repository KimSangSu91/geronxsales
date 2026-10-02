// 화면 표시용 한국어 이름 (enum 값 → 라벨)
import type {
  AccountStatus,
  AccountType,
  ContactRole,
  CustomerStatus,
  FacilityType,
  InboundChannel,
  PaymentMethod,
} from "@/generated/prisma/enums";

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  PENDING: "진행대기",
  ONBOARDING: "도입준비",
  TRIAL: "체험중",
  ACTIVE: "사용중",
  ENDED: "계약종료",
  TERMINATED: "계약해지",
  NOT_CONVERTED: "미전환",
  OTHER: "기타",
};

// 상태 탭·정렬 순서
export const CUSTOMER_STATUSES = Object.keys(CUSTOMER_STATUS_LABEL) as CustomerStatus[];

export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = {
  NURSING_HOME: "노인요양시설",
  GROUP_HOME: "공동생활가정",
  DAY_CARE: "주야간보호",
  HOME_CARE: "재가센터",
  OTHER: "기타",
};

export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  DIRECTOR: "원장",
  NURSING: "간호",
  ADMIN_BILLING: "행정·정산",
  OTHER: "기타",
};

export const INBOUND_CHANNEL_LABEL: Record<InboundChannel, string> = {
  GOOGLE_FORM: "구글폼",
  EMAIL: "이메일",
  PHONE: "전화",
  REFERRAL: "소개",
  OTHER: "기타",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "계좌이체",
  CMS: "CMS",
  CARD: "카드",
  OTHER: "기타",
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ADMIN: "관리자",
  NURSE: "간호",
  CAREGIVER: "요양보호사",
  OTHER: "기타",
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  IN_USE: "사용",
  INACTIVE: "비활성",
};
