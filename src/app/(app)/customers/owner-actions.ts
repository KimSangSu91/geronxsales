"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { recordHistory } from "@/lib/history";
import { ConflictError, saveWithVersion } from "@/lib/optimistic";
import { prisma } from "@/lib/prisma";

type Result = { ok: true; changed: number } | { ok: false; message: string };

// 내부 담당자 변경 — 상세 요약 카드(1곳, version 확인) · 목록 일괄 변경(여러 곳)
// targets: [{ id, version? }] — version이 있으면 그 사이 다른 사람이 고객사를 수정했는지 확인
export async function changeOwner(targets: { id: string; version?: number }[], ownerId: string): Promise<Result> {
  const me = await requireUser();
  if (!targets.length) return { ok: false, message: "고객사를 선택하세요." };
  if (targets.length > 500) return { ok: false, message: "한 번에 500곳까지 바꿀 수 있습니다." };
  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner?.isActive) return { ok: false, message: "활성 사용자를 선택하세요." };

  try {
    const changed = await prisma.$transaction(async (tx) => {
      const rows = await tx.customer.findMany({
        where: { id: { in: targets.map((t) => t.id) } },
        select: { id: true, ownerId: true, owner: { select: { name: true } } },
      });
      let n = 0;
      for (const t of targets) {
        const before = rows.find((r) => r.id === t.id);
        if (!before || before.ownerId === owner.id) continue;
        if (t.version !== undefined) {
          await saveWithVersion(() =>
            tx.customer.updateMany({ where: { id: t.id, version: t.version }, data: { ownerId: owner.id, version: { increment: 1 } } }),
          );
        } else {
          await tx.customer.update({ where: { id: t.id }, data: { ownerId: owner.id, version: { increment: 1 } } });
        }
        await recordHistory(tx, {
          customerId: t.id,
          event: "owner_changed",
          content: `내부 담당자 변경: ${before.owner.name} → ${owner.name}`,
          actorId: me.id,
        });
        n++;
      }
      return n;
    });
    revalidatePath("/customers", "layout");
    return { ok: true, changed };
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, message: "다른 사용자가 먼저 수정했습니다. 화면을 새로 불러온 뒤 다시 시도하세요." };
    throw e;
  }
}
