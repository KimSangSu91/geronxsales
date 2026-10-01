// 아직 구현하지 않은 메뉴의 임시 화면
export function ComingSoon({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex h-60 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        준비 중입니다 · {stage}에서 구현
      </div>
    </div>
  );
}
