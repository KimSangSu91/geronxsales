// 상태 전환(도착 상태)별 필수 항목 — 화면·서버 공용, 이 파일에서만 정의 (기능정의서 1장 "단계별 필수 입력 항목")
// 현재: 등록(진행대기). 다른 상태는 상태 변경 기능 작업 시 추가

export type MissingItem = { field: string; label: string };

// 등록 시 검사에 필요한 값 (고객사 등록 폼 입력)
export type RegistrationFacts = {
  name: string;
  facilityType: string;
  facilityTypeOther: string;
  region: string;
  ownerId: string;
  contacts: { name: string; phone: string }[];
};

const blank = (v: string | null | undefined) => !v || !v.trim();

// 등록(진행대기 — 직접 등록·인바운드 문의 전환 공통): 시설명 · 시설 유형 · 지역 · 내부 담당자 · 시설 담당자 1명(이름·연락처)
export function missingForRegistration(f: RegistrationFacts): MissingItem[] {
  const missing: MissingItem[] = [];
  if (blank(f.name)) missing.push({ field: "name", label: "시설명" });
  if (blank(f.facilityType)) missing.push({ field: "facilityType", label: "시설 유형" });
  else if (f.facilityType === "OTHER" && blank(f.facilityTypeOther))
    missing.push({ field: "facilityTypeOther", label: "시설 유형(직접입력)" });
  if (blank(f.region)) missing.push({ field: "region", label: "지역" });
  if (blank(f.ownerId)) missing.push({ field: "ownerId", label: "내부 담당자" });
  if (!f.contacts.some((c) => !blank(c.name) && !blank(c.phone)))
    missing.push({ field: "contacts", label: "시설 담당자 1명(이름·연락처)" });
  return missing;
}
