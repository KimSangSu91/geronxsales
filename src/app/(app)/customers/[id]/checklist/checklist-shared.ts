// 체크리스트 화면·서버 공용 타입 (브라우저에서도 import 가능)
import type { ClosureType, DeviceKind } from "@/generated/prisma/enums";

export type EntryView = {
  id: string;
  code: string;
  label: string;
  done: boolean;
  doneOn: string | null; // 'YYYY-MM-DD'
  doneBy: string | null; // 이름 / (비활성) 이름 / 이관
};

export type RecoveryLineView = {
  id: string;
  kind: DeviceKind;
  label: string | null;
  providedQty: number;
  recoveredQty: number;
  missingReason: string | null;
};

export type ClosureView = {
  id: string;
  type: ClosureType;
  createdOn: string;
  completed: boolean;
  recoveredOn: string | null;
  entries: EntryView[];
  recovery: RecoveryLineView[];
};

export type ChecklistView = {
  version: number; // 고객사 version (일정 수정 충돌 검사)
  installDate: string;
  onboarding: EntryView[];
  closures: ClosureView[];
  accounts: { total: number; inUse: string[] }; // 사용 중 계정 ID 목록
};

export const CLOSURE_TYPE_LABEL: Record<ClosureType, string> = {
  NOT_CONVERTED: "미전환",
  ENDED: "계약종료",
  TERMINATED: "계약해지",
};

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  BAND: "밴드",
  HUB: "허브",
  CHARGER: "충전기",
  ADAPTER: "어댑터",
  OTHER: "기타",
};
