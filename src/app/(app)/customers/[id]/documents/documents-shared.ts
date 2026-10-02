// 문서 탭 화면·서버 공용 타입 (브라우저에서도 import 가능)
import type { TabSlot } from "@/lib/document-rules";

export type DocView = {
  id: string;
  slot: TabSlot;
  title: string | null; // 추가 자료 서류명
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string; // KST 'YYYY-MM-DD HH:mm'
};

export type DocumentsTabData = {
  hasContract: boolean;
  fixed: Partial<Record<Exclude<TabSlot, "ETC">, DocView>>; // 기본 항목별 파일 (계약서는 현재 계약 기준)
  extra: DocView[]; // [자료 추가]로 만든 행
};
