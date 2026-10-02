import "server-only";
import { prisma } from "@/lib/prisma";

// 수정 충돌 모달용: 마지막으로 기록을 남긴 사람·시각
// (모든 변경은 히스토리에 기록되므로 해당 고객사의 최신 히스토리 기준)
export async function lastEditor(customerId: string) {
  const h = await prisma.history.findFirst({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, actor: { select: { name: true } } },
  });
  return { editorName: h?.actor?.name ?? "시스템", editedAt: (h?.createdAt ?? new Date()).toISOString() };
}
