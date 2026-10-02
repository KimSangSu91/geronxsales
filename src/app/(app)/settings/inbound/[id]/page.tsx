import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parseAnswers } from "@/lib/inbound";
import { prisma } from "@/lib/prisma";
import { SourceEditor } from "../source-forms";

// 문의 수신 경로 상세: 이름·수신 여부·기본 담당자, 질문 연결, 구글폼 연결 스크립트
export default async function InboundSourcePage({ params }: PageProps<"/settings/inbound/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const [source, owners, latest] = await Promise.all([
    prisma.inboundSource.findUnique({ where: { id } }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.inquiry.findMany({ where: { sourceId: id }, orderBy: { receivedAt: "desc" }, take: 20, select: { raw: true } }),
  ]);
  if (!source) notFound();

  // 질문별 최근 답변 예시
  const samples: Record<string, string> = {};
  for (const q of latest) {
    for (const a of parseAnswers((q.raw as { answers?: unknown } | null)?.answers)) {
      if (!samples[a.question] && a.answer.trim()) samples[a.question] = a.answer.slice(0, 80);
    }
  }
  // 수신 주소: 운영 주소 기준 (개발 PC 주소는 구글에서 접근할 수 없음)
  const host = (await headers()).get("host") ?? "";
  const origin = /localhost|127\.0\.0\.1/.test(host) ? "https://neulcaresales.vercel.app" : `https://${host}`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/settings/inbound" className="hover:text-foreground">
            문의 수신 경로
          </Link>{" "}
          › {source.name}
        </p>
        <h1 className="mt-1 text-xl font-semibold">{source.name}</h1>
      </div>
      <SourceEditor
        key={source.version}
        source={{
          id: source.id,
          version: source.version,
          name: source.name,
          isActive: source.isActive,
          defaultOwnerId: source.defaultOwnerId,
          token: source.token,
          mapping: (source.mapping ?? {}) as Record<string, string>,
          questions: (source.questions ?? []) as string[],
        }}
        samples={samples}
        owners={owners}
        endpoint={`${origin}/api/inbound/google-form`}
      />
    </div>
  );
}
