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

// 문서 탭 슬롯 (세금계산서는 청구 탭에서 관리)
export type TabSlot = Exclude<DocumentSlot, "TAX_INVOICE">;

export const SLOT_CONFIG: Record<TabSlot, { label: string; required: boolean; multiple: boolean; group: "required" | "optional" | "etc" }> = {
  CONTRACT: { label: "계약서", required: true, multiple: false, group: "required" },
  DEVICE_RECEIPT: { label: "디바이스 인수증", required: true, multiple: false, group: "required" },
  BIZ_REGISTRATION: { label: "사업자등록증", required: false, multiple: false, group: "optional" },
  BANKBOOK: { label: "통장사본", required: false, multiple: false, group: "optional" },
  DRAWING: { label: "도면", required: false, multiple: true, group: "optional" },
  RESIDENT_LIST: { label: "입소자 명단", required: false, multiple: false, group: "optional" },
  ETC: { label: "기타 자료", required: false, multiple: true, group: "etc" },
};

export const TAB_SLOTS = Object.keys(SLOT_CONFIG) as TabSlot[];

export const ETC_CATEGORY_LABEL = { INSTALL_PHOTO: "설치 사진", OTHER: "기타" } as const;

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
