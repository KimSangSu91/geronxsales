import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { todayKst, toDbDate } from "@/lib/date";

// 자동 히스토리 기록 — 데이터 변경과 같은 트랜잭션(tx) 안에서 호출
// actorId: 처리한 사용자 id, 시스템 처리(배치·이관)는 null
export async function recordHistory(
  tx: Prisma.TransactionClient,
  entry: {
    customerId: string;
    event: string; // customer_created, status_changed, file_uploaded …
    content: string; // 화면에 보이는 한 줄 내용
    actorId: string | null;
    data?: Prisma.InputJsonValue; // before/after 등 상세
  },
) {
  return tx.history.create({
    data: {
      customerId: entry.customerId,
      kind: "AUTO",
      event: entry.event,
      content: entry.content,
      data: entry.data,
      actorId: entry.actorId,
      occurredOn: toDbDate(todayKst()),
    },
  });
}
