// 고객사 등록 입력값 형식·검사 — 화면(즉시 표시)과 서버(저장 전)에서 같은 함수 사용
import type { ContactRole, FacilityType, InboundChannel, PaymentMethod } from "@/generated/prisma/enums";
import {
  CONTACT_ROLE_LABEL,
  FACILITY_TYPE_LABEL,
  INBOUND_CHANNEL_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/labels";
import { missingContactFields, missingCustomerFields, missingForRegistration } from "@/lib/status-rules";

export type ContactInput = {
  name: string;
  phone: string;
  role: ContactRole | "";
  title: string;
  email: string;
  memo: string;
  isPrimary: boolean;
};

export type CustomerInput = {
  // 기본
  name: string;
  code: string;
  facilityType: FacilityType | "";
  facilityTypeOther: string;
  region: string;
  address: string;
  capacity: string;
  ownerId: string;
  inboundChannel: InboundChannel | "";
  referrer: string;
  memo: string;
  // 시설 담당자
  contacts: ContactInput[];
  // 사업자 정보
  bizName: string;
  bizNo: string;
  bizCeo: string;
  // 정산 정보
  billingDay: string;
  paymentMethod: PaymentMethod | "";
  taxInvoice: "" | "yes" | "no";
  taxInvoiceEmail: string;
  // 설치 환경
  floors: string;
  rooms: string;
  wifiSsid: string;
  wifiPassword: string;
  networkMemo: string;
  // 서비스 운영
  serviceUrl: string;
};

export type FieldErrors = Record<string, string>;

export const emptyContact = (isPrimary = false): ContactInput => ({
  name: "",
  phone: "",
  role: "",
  title: "",
  email: "",
  memo: "",
  isPrimary,
});

export const CODE_RE = /^[a-z0-9]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/\S+$/i;

// 숫자만 남겨 하이픈 형식으로: 01012345678 → 010-1234-5678, 0212345678 → 02-1234-5678
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("02")) {
    if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    if (d.length === 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  } else {
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`; // 1588-0000
  return raw.trim();
}

// 사업자등록번호 1234567890 → 123-45-67890
export function normalizeBizNo(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : raw.trim();
}

const isInt = (v: string, min: number, max: number) => {
  const n = Number(v);
  return /^\d+$/.test(v.trim()) && n >= min && n <= max;
};

const notIn = (labels: object, v: string | undefined) => !!v && !Object.hasOwn(labels, v);

// 고객사 필드 검사 — values에 들어 있는 항목만 검사 (등록: 전체 / 상세 수정: 해당 섹션만)
export function validateCustomerFields(values: Partial<Record<string, string>>): FieldErrors {
  const errors: FieldErrors = {};
  const v = (k: string) => (values[k] ?? "").trim();

  // 필수 항목 (lib/status-rules.ts)
  for (const m of missingCustomerFields(values)) errors[m.field] = `${m.label}을(를) 입력하세요.`;

  // 선택지 값 (목록에 없는 값 차단)
  if (notIn(FACILITY_TYPE_LABEL, values.facilityType)) errors.facilityType = "시설 유형을 다시 선택하세요.";
  if (notIn(INBOUND_CHANNEL_LABEL, values.inboundChannel)) errors.inboundChannel = "유입 채널을 다시 선택하세요.";
  if (notIn(PAYMENT_METHOD_LABEL, values.paymentMethod)) errors.paymentMethod = "결제 수단을 다시 선택하세요.";
  for (const k of ["taxInvoice", "cmsEnabled"]) {
    if (k in values && !["", "yes", "no"].includes(values[k] ?? "")) errors[k] = "다시 선택하세요.";
  }

  // 형식
  if (v("code") && !CODE_RE.test(v("code"))) errors.code = "영문 소문자와 숫자만 사용할 수 있습니다.";
  if (v("capacity") && !isInt(v("capacity"), 0, 100000)) errors.capacity = "숫자만 입력하세요.";
  if (v("billingDay") && !isInt(v("billingDay"), 1, 31)) errors.billingDay = "1~31 사이 숫자를 입력하세요.";
  if (v("floors") && !isInt(v("floors"), 0, 1000)) errors.floors = "숫자만 입력하세요.";
  if (v("rooms") && !isInt(v("rooms"), 0, 100000)) errors.rooms = "숫자만 입력하세요.";
  if (v("taxInvoiceEmail") && !EMAIL_RE.test(v("taxInvoiceEmail")))
    errors.taxInvoiceEmail = "이메일 형식이 올바르지 않습니다.";
  if (v("serviceUrl") && !URL_RE.test(v("serviceUrl")))
    errors.serviceUrl = "http:// 또는 https:// 로 시작하는 주소를 입력하세요.";

  return errors;
}

// 시설 담당자 1명 검사 (등록 폼의 담당자·상세의 담당자 추가/수정 공용)
export function validateContact(c: Omit<ContactInput, "isPrimary">, required: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (required) for (const m of missingContactFields(c)) errors[m.field] = `${m.label}을(를) 입력하세요.`;
  else if (!c.name.trim()) errors.name = "이름을 입력하세요.";
  if (notIn(CONTACT_ROLE_LABEL, c.role)) errors.role = "역할을 다시 선택하세요.";
  if (c.phone.trim() && c.phone.replace(/D/g, "").length < 8) errors.phone = "연락처를 확인하세요.";
  if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) errors.email = "이메일 형식이 올바르지 않습니다.";
  return errors;
}

export function validateCustomerInput(input: CustomerInput): FieldErrors {
  const { contacts, ...fields } = input;
  const errors = validateCustomerFields(fields);

  // 시설 담당자 1명 이상 (lib/status-rules.ts)
  for (const m of missingForRegistration(input)) {
    if (m.field !== "contacts") continue;
    errors.contacts = m.label.startsWith("대표") ? "대표 담당자를 1명 이상 지정하세요." : `${m.label}을(를) 입력하세요.`;
  }

  contacts.forEach((c, i) => {
    const filled = [c.name, c.phone, c.title, c.email, c.memo].some((v) => v.trim()) || c.role;
    if (!filled) return;
    for (const [k, msg] of Object.entries(validateContact(c, false))) errors[`contacts.${i}.${k}`] = msg;
  });

  return errors;
}
