import "server-only";

// 동시 편집 저장(낙관적 잠금): 편집 시작 때 받은 version과 DB의 version이 같을 때만 저장
// 사용: await saveWithVersion(() => tx.customer.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } }))
// 그 사이 다른 사람이 저장했으면(0건 갱신) ConflictError → 화면에서 충돌 모달 표시 (덮어쓰기 금지)

export class ConflictError extends Error {
  constructor() {
    super("다른 사용자가 먼저 수정했습니다.");
    this.name = "ConflictError";
  }
}

export async function saveWithVersion(update: () => Promise<{ count: number }>): Promise<void> {
  const { count } = await update();
  if (count === 0) throw new ConflictError();
}
