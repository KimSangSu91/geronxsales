// 문서 규칙 — 화면·서버·저장소 설정 공용 (기능정의서 4-8)
import type { DocumentSlot } from "@/generated/prisma/enums";

export const DOCUMENT_BUCKET = "documents";
export const MAX_FILE_MB = 20;

// PDF·이미지만 허용 (한글·오피스 문서 불가)
export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/jpeg,image/png,image/webp,image/gif";

// 문서 탭 기본 항목 (세금계산서는 청구 탭에서 관리) — 모든 항목은 파일 1개만 (바꾸려면 교체)
export type TabSlot = Exclude<DocumentSlot, "TAX_INVOICE">;

export const SLOT_CONFIG: Record<TabSlot, { label: string; required: boolean }> = {
  CONTRACT: { label: "계약서", required: true },
  DEVICE_RECEIPT: { label: "디바이스 인수증", required: true },
  BIZ_REGISTRATION: { label: "사업자등록증", required: false },
  BANKBOOK: { label: "통장사본", required: false },
  DRAWING: { label: "도면", required: false },
  RESIDENT_LIST: { label: "입소자 명단", required: false },
  ETC: { label: "추가 자료", required: false }, // [자료 추가]로 만드는 행 — 서류명 직접 입력
};

export const TAB_SLOTS = Object.keys(SLOT_CONFIG) as TabSlot[];
// 표에 항상 보이는 기본 항목 순서
export const FIXED_SLOTS: Exclude<TabSlot, "ETC">[] = ["CONTRACT", "DEVICE_RECEIPT", "BIZ_REGISTRATION", "BANKBOOK", "DRAWING", "RESIDENT_LIST"];

export const TITLE_MAX = 50;
export function titleProblem(title: string): string | null {
  if (!title.trim()) return "서류명을 입력하세요.";
  if (title.trim().length > TITLE_MAX) return `서류명은 ${TITLE_MAX}자까지 입력할 수 있습니다.`;
  return null;
}

// 업로드 전 검사 (화면에서 먼저, 서버에서 다시)
export function fileProblem(f: { name: string; size: number; type: string }): string | null {
  if (!ALLOWED_TYPES[f.type]) return "PDF와 이미지(jpg·png·webp·gif)만 올릴 수 있습니다.";
  if (f.size <= 0) return "빈 파일입니다.";
  if (f.size > MAX_FILE_MB * 1024 * 1024) return `파일 크기는 ${MAX_FILE_MB}MB까지입니다.`;
  if (f.name.length > 200) return "파일 이름이 너무 깁니다.";
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
