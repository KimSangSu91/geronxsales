// 히스토리 화면·서버 공용 타입·상수 (브라우저에서도 import 가능)
import type { ActivityType } from "@/generated/prisma/enums";

// 화면 표시용 히스토리 1건
export type HistoryItem = {
  id: string;
  kind: "AUTO" | "MANUAL";
  activityType: ActivityType | null;
  occurredOn: string; // 'YYYY-MM-DD'
  createdAt: string; // KST 'YYYY-MM-DD HH:mm'
  content: string;
  author: string; // 표시 이름: 이름 / (비활성) 이름 / 시스템 / 이관
  mine: boolean; // 본인 수동 기록 → 수정·삭제 가능
  edited: boolean;
};

export type HistoryFilters = {
  kind?: "AUTO" | "MANUAL";
  type?: ActivityType;
  from?: string;
  to?: string;
  author?: string; // 사용자 id 또는 "system"(시스템·이관)
  limit: number;
};

export const HISTORY_PAGE = 50;
