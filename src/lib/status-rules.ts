// 상태 전환(도착 상태)별 필수 항목 — 화면·서버 공용, 이 파일에서만 정의 (기능정의서 1장 "단계별 필수 입력 항목")
// 현재: 등록(진행대기)과 그 이후 항상 비워둘 수 없는 기본 항목. 다른 상태는 상태 변경 기능 작업 시 추가

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

// 등록(진행대기 — 직접 등록·인바운드 문의 전환 공통): 시설명 · 시설 유형 · 지역 · 내부 담당자 · 시설 담당자 1명(이름·연락처)
export type RegistrationFacts = {
  name: string;
  facilityType: string;
  facilityTypeOther: string;
  region: string;
  ownerId: string;
  contacts: { name: string; phone: string }[];
};

export function missingForRegistration(f: RegistrationFacts): MissingItem[] {
  const { contacts, ...fields } = f;
  const missing = missingCustomerFields(fields);
  if (!contacts.some((c) => !blank(c.name) && !blank(c.phone)))
    missing.push({ field: "contacts", label: "시설 담당자 1명(이름·연락처)" });
  return missing;
}

// 시설 담당자 1명 필수 항목 (추가·수정 시)
export function missingContactFields(c: { name: string; phone: string }): MissingItem[] {
  const missing: MissingItem[] = [];
  if (blank(c.name)) missing.push({ field: "name", label: "이름" });
  if (blank(c.phone)) missing.push({ field: "phone", label: "연락처" });
  return missing;
}
