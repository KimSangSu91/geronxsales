// 문서 탭 화면·서버 공용 타입 (브라우저에서도 import 가능)
import type { EtcCategory } from "@/generated/prisma/enums";
import type { TabSlot } from "@/lib/document-rules";

export type DocView = {
  id: string;
  slot: TabSlot;
  etcCategory: EtcCategory | null;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string; // KST 'YYYY-MM-DD HH:mm'
};

export type DocumentsTabData = {
  hasContract: boolean;
  status: string;
  contract: DocView | null; // 현재 계약의 계약서
  deviceReceipt: DocView | null;
  bizRegistration: DocView | null;
  bankbook: DocView | null;
  residentList: DocView | null;
  drawings: DocView[];
  etc: DocView[];
};

// 필수 서류 누락 (도입준비·사용중에서 경고)
export function missingRequired(d: DocumentsTabData): string[] {
  const missing: string[] = [];
  if (!d.contract) missing.push("계약서");
  if (!d.deviceReceipt) missing.push("디바이스 인수증");
  return missing;
}
