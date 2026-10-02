// 상태 전환(도착 상태)별 필수 항목 — 화면·서버 공용, 이 파일에서만 정의 (기능정의서 1장 "단계별 필수 입력 항목")

import type { CustomerStatus } from "@/generated/prisma/enums";
import { isDateString } from "@/lib/date";

export type MissingItem = { field: string; label: string };

const blank = (v: string | null | undefined) => !v || !v.trim();

// 고객사 기본 필수 항목: 등록 때 필수이고, 이후 수정할 때도 비울 수 없음
// values에 들어 있는 항목만 검사 (섹션 단위 수정에서 해당 섹션 값만 넘김)
export function missingCustomerFields(values: Partial<Record<string, string>>): MissingItem[] {
  const missing: MissingItem[] = [];
  const has = (k: string) => k in values;
  if (has("name") && blank(values.name)) missing.push({ field: "name", label: "시설명" });
  if (has("facilityType")) {
    if (blank(values.facilityType)) missing.push({ field: "facilityType", label: "시설 유형" });
    else if (values.facilityType === "OTHER" && blank(values.facilityTypeOther))
      missing.push({ field: "facilityTypeOther", label: "시설 유형(직접입력)" });
  }
  if (has("region") && blank(values.region)) missing.push({ field: "region", label: "지역" });
  if (has("ownerId") && blank(values.ownerId)) missing.push({ field: "ownerId", label: "내부 담당자" });
  return missing;
}

// 등록(진행대기 — 직접 등록·인바운드 문의 전환 공통): 시설명 · 시설 유형 · 지역 · 내부 담당자 · 시설 담당자 1명(이름·연락처) · 대표 담당자 1명 이상
export type RegistrationFacts = {
  name: string;
  facilityType: string;
  facilityTypeOther: string;
  region: string;
  ownerId: string;
  contacts: { name: string; phone: string; isPrimary: boolean }[];
};

export function missingForRegistration(f: RegistrationFacts): MissingItem[] {
  const { contacts, ...fields } = f;
  const missing = missingCustomerFields(fields);
  if (!contacts.some((c) => !blank(c.name) && !blank(c.phone)))
    missing.push({ field: "contacts", label: "시설 담당자 1명(이름·연락처)" });
  else if (!contacts.some((c) => c.isPrimary && !blank(c.name)))
    missing.push({ field: "contacts", label: "대표 담당자 1명 이상" });
  return missing;
}

// 대표 담당자(실무·주 소통 담당자)는 고객사마다 1명 이상 — 해제·삭제로 0명이 되면 안 됨
export const PRIMARY_CONTACT_REQUIRED_MESSAGE = "대표 담당자는 1명 이상 지정해야 합니다. 다른 담당자를 먼저 대표로 지정하세요.";

export function wouldLeaveNoPrimary(primaryIdsNow: string[], targetId: string): boolean {
  return primaryIdsNow.length === 1 && primaryIdsNow[0] === targetId;
}

// 시설 담당자 1명 필수 항목 (추가·수정 시)
export function missingContactFields(c: { name: string; phone: string }): MissingItem[] {
  const missing: MissingItem[] = [];
  if (blank(c.name)) missing.push({ field: "name", label: "이름" });
  if (blank(c.phone)) missing.push({ field: "phone", label: "연락처" });
  return missing;
}

// ───────── 상태 전환 (기능정의서 1장 "단계별 필수 입력 항목") ─────────

// 전환 검사에 필요한 고객사 현재 정보 (서버에서 모아 화면에도 전달)
export type StatusFacts = {
  code: string | null;
  address: string | null;
  bizName: string | null;
  bizNo: string | null;
  bizCeo: string | null;
  installDate: string | null;
  serviceUrl: string | null;
  billingDay: number | null;
  paymentMethod: string | null;
  taxInvoice: boolean | null;
  taxInvoiceEmail: string | null;
  contract: { contractUsers: number; qtyTotal: number } | null; // 현재 계약
  chargeCount: number; // 현재 계약의 비용 항목 수(무상 포함)
  docs: { contract: boolean; deviceReceipt: boolean }; // 최신본 업로드 여부
  inUseAccounts: number; // 사용 중 서비스 계정 수
};

// 상태 변경 창에서 입력하는 값
export type TransitionInput = {
  trialStart: string;
  trialEnd: string;
  qtyHub: string;
  qtyBand: string;
  qtyCharger: string;
  qtyAdapter: string;
  endedOn: string; // 계약종료 종료일 / 계약해지 해지일
  reason: string; // 해지·미전환·기타 사유
};

export const emptyTransitionInput = (): TransitionInput => ({
  trialStart: "",
  trialEnd: "",
  qtyHub: "",
  qtyBand: "",
  qtyCharger: "",
  qtyAdapter: "",
  endedOn: "",
  reason: "",
});

// 상태 변경 창에서 받는 입력 항목
export const TRANSITION_FIELDS: Partial<Record<CustomerStatus, (keyof TransitionInput)[]>> = {
  TRIAL: ["trialStart", "trialEnd", "qtyHub", "qtyBand", "qtyCharger", "qtyAdapter"],
  ENDED: ["endedOn"],
  TERMINATED: ["endedOn", "reason"],
  NOT_CONVERTED: ["reason"],
  OTHER: ["reason"],
};

const qty = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);

// 상태 변경 창 입력값 검사 (형식·필수) — 필드별 오류
export function transitionInputErrors(target: CustomerStatus, input: TransitionInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const fields = TRANSITION_FIELDS[target] ?? [];
  if (fields.includes("trialStart")) {
    if (!isDateString(input.trialStart)) errors.trialStart = "체험 시작일을 선택하세요.";
    if (!isDateString(input.trialEnd)) errors.trialEnd = "체험 종료일을 선택하세요.";
    else if (isDateString(input.trialStart) && input.trialEnd < input.trialStart)
      errors.trialEnd = "종료일은 시작일 이후여야 합니다.";
    const q = [input.qtyHub, input.qtyBand, input.qtyCharger, input.qtyAdapter];
    if (q.some((v) => v.trim() && Number.isNaN(qty(v)))) errors.trialQty = "수량은 0 이상의 숫자로 입력하세요.";
    else if (q.reduce((s, v) => s + (qty(v) || 0), 0) <= 0) errors.trialQty = "체험 장비 수량을 입력하세요.";
  }
  if (fields.includes("endedOn") && !isDateString(input.endedOn))
    errors.endedOn = target === "TERMINATED" ? "해지일을 선택하세요." : "종료일을 선택하세요.";
  if (fields.includes("reason") && !input.reason.trim()) errors.reason = "사유를 입력하세요.";
  return errors;
}

const filled = (v: string | null | undefined) => !!v && !!v.trim();

// 도착 상태 기준 고객사에 미리 입력돼 있어야 하는 항목 (창에서 받는 입력 제외)
// field는 화면에서 "입력하러 가기" 위치를 정하는 키
export function missingForStatus(target: CustomerStatus, f: StatusFacts): MissingItem[] {
  const m: MissingItem[] = [];
  const need = (ok: boolean, field: string, label: string) => !ok && m.push({ field, label });

  const onboarding = () => {
    need(filled(f.code), "code", "고객사 코드");
    need(filled(f.address), "address", "주소");
    if (!f.contract) need(false, "contract", "계약 (계약일·시작일·종료일·계약 인원·계약 장비 수량)");
    else {
      need(f.contract.contractUsers > 0, "contract", "계약 인원");
      need(f.contract.qtyTotal > 0, "contract", "계약 장비 수량");
    }
    need(f.chargeCount > 0, "charges", "비용 항목 1개 이상 (무상 가능)");
    need(filled(f.bizName), "bizName", "운영 법인명");
    need(filled(f.bizNo), "bizNo", "사업자등록번호");
    need(filled(f.bizCeo), "bizCeo", "대표자명");
    need(!!f.installDate, "installDate", "설치 예정일");
  };

  switch (target) {
    case "ONBOARDING":
      onboarding();
      break;
    case "TRIAL":
      need(filled(f.code), "code", "고객사 코드");
      need(filled(f.address), "address", "주소");
      break;
    case "ACTIVE":
      onboarding();
      need(f.docs.contract, "contractDoc", "계약서 업로드");
      need(f.docs.deviceReceipt, "deviceReceiptDoc", "디바이스 인수증 업로드");
      need(filled(f.serviceUrl), "serviceUrl", "서비스 페이지 URL");
      need(f.inUseAccounts > 0, "accounts", "관리자 계정 1개 이상 (서비스 계정)");
      need(f.billingDay !== null, "billingDay", "청구일");
      need(filled(f.paymentMethod), "paymentMethod", "결제 수단");
      need(f.taxInvoice !== null, "taxInvoice", "세금계산서 발행 여부");
      need(filled(f.taxInvoiceEmail), "taxInvoiceEmail", "세금계산서 발행 이메일");
      break;
  }
  return m;
}

// 사용중 전환 시 체크리스트 확인창 문구용: 미완료 항목명 (3개 초과 시 "외 N건")
export function summarizeItems(labels: string[], max = 3): string {
  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} 외 ${labels.length - max}건`;
}

// 회수·종료 체크리스트를 만드는 전환 (기능정의서 4-5-2)
export function closureTypeFor(
  from: CustomerStatus,
  to: CustomerStatus,
): "NOT_CONVERTED" | "ENDED" | "TERMINATED" | null {
  if (to === "ENDED") return "ENDED";
  if (to === "TERMINATED") return "TERMINATED";
  if (to === "NOT_CONVERTED" && from === "TRIAL") return "NOT_CONVERTED";
  return null;
}

// 회수·종료 체크리스트 항목 (ChecklistItem.code)
export const CLOSURE_ITEM_CODES: Record<"NOT_CONVERTED" | "ENDED" | "TERMINATED", string[]> = {
  NOT_CONVERTED: ["recovery"],
  ENDED: ["recovery", "account_deactivation", "privacy_disposal", "final_invoice"],
  TERMINATED: ["recovery", "account_deactivation", "privacy_disposal", "final_invoice"],
};
