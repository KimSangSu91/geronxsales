// 기본정보 탭의 단일 섹션 5개 정의 — 화면(표시·편집)과 서버(검사·저장·히스토리)가 함께 사용 (화면정의서 4-1)
import {
  FACILITY_TYPE_LABEL,
  INBOUND_CHANNEL_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/labels";

export type SectionKey = "basic" | "biz" | "billing" | "install" | "service";

export type FieldKind = "text" | "textarea" | "int" | "select" | "owner" | "yesno" | "email" | "url" | "secret" | "code";

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  wide?: boolean; // 두 칸 차지
  options?: Record<string, string>; // select 선택지
  yesNo?: [string, string]; // yesno 표시 문구 [예, 아니오]
  placeholder?: string;
  suffix?: string; // 표시 시 단위
  showIf?: (values: Values) => boolean; // 조건부 항목 (기타 직접입력 등)
};

export type Values = Record<string, string>;

export const SECTIONS: Record<SectionKey, { title: string; fields: FieldDef[] }> = {
  basic: {
    title: "기본",
    fields: [
      { key: "name", label: "시설명", kind: "text", required: true },
      { key: "code", label: "고객사 코드", kind: "code", placeholder: "예) hbnh" },
      { key: "facilityType", label: "시설 유형", kind: "select", required: true, options: FACILITY_TYPE_LABEL },
      {
        key: "facilityTypeOther",
        label: "시설 유형(직접입력)",
        kind: "text",
        required: true,
        showIf: (v) => v.facilityType === "OTHER",
      },
      { key: "region", label: "지역", kind: "text", required: true, placeholder: "예) 남양주" },
      { key: "address", label: "주소", kind: "text", wide: true },
      { key: "capacity", label: "정원", kind: "int", suffix: "명" },
      { key: "ownerId", label: "내부 담당자", kind: "owner", required: true },
      { key: "inboundChannel", label: "유입 채널", kind: "select", options: INBOUND_CHANNEL_LABEL },
      { key: "referrer", label: "소개처", kind: "text", showIf: (v) => v.inboundChannel === "REFERRAL" },
      { key: "memo", label: "메모", kind: "textarea", wide: true },
    ],
  },
  biz: {
    title: "사업자 정보",
    fields: [
      { key: "bizName", label: "운영 법인명", kind: "text" },
      { key: "bizNo", label: "사업자등록번호", kind: "text", placeholder: "000-00-00000" },
      { key: "bizCeo", label: "대표자명", kind: "text" },
    ],
  },
  billing: {
    title: "정산 정보",
    fields: [
      { key: "billingDay", label: "청구일 (매월)", kind: "int", placeholder: "1~31", suffix: "일" },
      { key: "paymentMethod", label: "결제 수단", kind: "select", options: PAYMENT_METHOD_LABEL },
      { key: "taxInvoice", label: "세금계산서 발행", kind: "yesno", yesNo: ["발행", "미발행"] },
      { key: "taxInvoiceEmail", label: "발행 이메일", kind: "email" },
      { key: "cmsMemberNo", label: "CMS 회원번호", kind: "text" },
      { key: "cmsEnabled", label: "CMS 연동", kind: "yesno", yesNo: ["연동", "미연동"] },
    ],
  },
  install: {
    title: "설치 환경",
    fields: [
      { key: "floors", label: "층수", kind: "int", suffix: "층" },
      { key: "rooms", label: "생활실(호실) 수", kind: "int", suffix: "개" },
      { key: "wifiSsid", label: "와이파이 이름(SSID)", kind: "text" },
      { key: "wifiPassword", label: "와이파이 비밀번호", kind: "secret" },
      { key: "networkMemo", label: "네트워크 메모", kind: "text", wide: true },
    ],
  },
  service: {
    title: "서비스 운영",
    fields: [{ key: "serviceUrl", label: "서비스 페이지 URL", kind: "url", wide: true, placeholder: "https://" }],
  },
};

export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

// 화면에 보이는 필드 (조건부 항목 반영)
export function visibleFields(section: SectionKey, values: Values): FieldDef[] {
  return SECTIONS[section].fields.filter((f) => !f.showIf || f.showIf(values));
}

// 표시용 문자열 ('-' = 비어 있음). owner는 사용자 이름 목록으로 변환
export function displayValue(f: FieldDef, value: string, owners: { id: string; name: string }[] = []): string {
  if (!value) return "-";
  switch (f.kind) {
    case "select":
      return f.options?.[value] ?? value;
    case "owner":
      return owners.find((o) => o.id === value)?.name ?? "알 수 없음";
    case "yesno":
      return value === "yes" ? f.yesNo![0] : f.yesNo![1];
    case "int":
      return `${value}${f.suffix ?? ""}`;
    case "secret":
      return "••••••";
    default:
      return value;
  }
}

// DB 고객사 → 편집용 값 (모두 문자열, 비밀번호는 비움)
type CustomerRow = {
  name: string;
  code: string | null;
  facilityType: string;
  facilityTypeOther: string | null;
  region: string;
  address: string | null;
  capacity: number | null;
  ownerId: string;
  inboundChannel: string | null;
  referrer: string | null;
  memo: string | null;
  bizName: string | null;
  bizNo: string | null;
  bizCeo: string | null;
  billingDay: number | null;
  paymentMethod: string | null;
  taxInvoice: boolean | null;
  taxInvoiceEmail: string | null;
  cmsMemberNo: string | null;
  cmsEnabled: boolean;
  floors: number | null;
  rooms: number | null;
  wifiSsid: string | null;
  networkMemo: string | null;
  serviceUrl: string | null;
};

const yn = (b: boolean | null) => (b === null ? "" : b ? "yes" : "no");

export function customerValues(c: CustomerRow): Values {
  return {
    name: c.name,
    code: c.code ?? "",
    facilityType: c.facilityType,
    facilityTypeOther: c.facilityTypeOther ?? "",
    region: c.region,
    address: c.address ?? "",
    capacity: c.capacity?.toString() ?? "",
    ownerId: c.ownerId,
    inboundChannel: c.inboundChannel ?? "",
    referrer: c.referrer ?? "",
    memo: c.memo ?? "",
    bizName: c.bizName ?? "",
    bizNo: c.bizNo ?? "",
    bizCeo: c.bizCeo ?? "",
    billingDay: c.billingDay?.toString() ?? "",
    paymentMethod: c.paymentMethod ?? "",
    taxInvoice: yn(c.taxInvoice),
    taxInvoiceEmail: c.taxInvoiceEmail ?? "",
    cmsMemberNo: c.cmsMemberNo ?? "",
    cmsEnabled: yn(c.cmsEnabled),
    floors: c.floors?.toString() ?? "",
    rooms: c.rooms?.toString() ?? "",
    wifiSsid: c.wifiSsid ?? "",
    wifiPassword: "",
    networkMemo: c.networkMemo ?? "",
    serviceUrl: c.serviceUrl ?? "",
  };
}

// 섹션 값만 추리기
export function pickSection(section: SectionKey, values: Values): Values {
  return Object.fromEntries(SECTIONS[section].fields.map((f) => [f.key, values[f.key] ?? ""]));
}
