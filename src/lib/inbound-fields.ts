// 구글폼 질문 → 문의 항목 연결 (화면·서버 공용)
export const INQUIRY_FIELDS = {
  facilityName: "시설명",
  contactName: "담당자",
  phone: "연락처",
  email: "이메일",
  region: "지역",
  scale: "규모",
  content: "문의 내용",
} as const;
export type InquiryField = keyof typeof INQUIRY_FIELDS;
export type MappingTarget = InquiryField | "none"; // none = 문의 내용 아래 "질문: 답변"으로만 남김
export type FormAnswer = { question: string; answer: string };

// 질문 제목으로 항목 추측 (세일즈팀마다 질문 문구가 달라도 흔한 표현은 자동 연결)
export function guessField(question: string): MappingTarget {
  const q = question.replace(/\s/g, "").toLowerCase();
  if (/이메일|메일|e-?mail/.test(q)) return "email";
  if (/연락처|전화|휴대폰|핸드폰|휴대전화|phone|tel|번호/.test(q)) return "phone";
  if (/(시설|기관|센터|업체|회사|요양원|병원)(명|이름|명칭)|^(시설|기관|상호|업체명|회사명)$|상호/.test(q)) return "facilityName";
  if (/성함|이름|담당자|신청자|작성자|성명/.test(q)) return "contactName";
  if (/지역|주소|소재지|위치|시군구|시도/.test(q)) return "region";
  if (/규모|인원|정원|입소자|병상|침상|수용|어르신수|베드/.test(q)) return "scale";
  if (/문의|내용|요청|궁금|메모|비고|기타|남기실|하실말/.test(q)) return "content";
  if (/시설|기관/.test(q)) return "facilityName";
  return "none";
}

export function targetOf(mapping: Record<string, MappingTarget>, question: string): MappingTarget {
  return Object.hasOwn(mapping, question) ? mapping[question] : guessField(question);
}

// 답변들을 문의 항목으로 정리 — 같은 항목에 여러 질문이 연결되면 이어 붙임, 연결 안 된 질문은 내용 아래에 모두 남김
export function applyMapping(answers: FormAnswer[], mapping: Record<string, MappingTarget>) {
  const out: Partial<Record<InquiryField, string>> = {};
  const extras: string[] = [];
  for (const { question, answer } of answers) {
    const a = answer.trim();
    if (!a) continue;
    const t = targetOf(mapping, question);
    if (t === "none") extras.push(`${question}: ${a}`);
    else if (t === "content") out.content = out.content ? `${out.content}\n${a}` : a;
    else out[t] = out[t] ? `${out[t]} / ${a}` : a;
  }
  if (extras.length) out.content = [out.content, extras.join("\n")].filter(Boolean).join("\n\n");
  return out;
}
