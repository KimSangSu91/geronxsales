import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDateTimeKst } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { AddSourceButton } from "./source-forms";

// 설정 > 문의 수신 경로 (구글폼별, 관리자 전용)
export default async function InboundSourcesPage() {
  await requireAdmin();
  const [sources, owners, counts] = await Promise.all([
    prisma.inboundSource.findMany({ orderBy: { createdAt: "asc" }, include: { defaultOwner: { select: { name: true } } } }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.inquiry.groupBy({ by: ["sourceId", "status"], where: { sourceId: { not: null } }, _count: { _all: true } }),
  ]);
  const count = (id: string, status?: string) =>
    counts.filter((c) => c.sourceId === id && (!status || c.status === status)).reduce((s, c) => s + c._count._all, 0);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">문의 수신 경로</h1>
      <section className="rounded-lg border bg-background">
        <div className="card-head">
          <h2>
            구글폼 <span className="text-sm font-normal text-muted-foreground">{sources.length}개</span>
          </h2>
          <AddSourceButton owners={owners} />
        </div>
        {sources.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">등록된 경로가 없습니다</p>
        ) : (
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>이름</th>
                <th>상태</th>
                <th>기본 담당자</th>
                <th className="text-right">미처리</th>
                <th className="text-right">전체 문의</th>
                <th>최근 수신</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td>
                    <Link href={`/settings/inbound/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td>
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                        s.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {s.isActive ? "수신 중" : "중지"}
                    </span>
                  </td>
                  <td>{s.defaultOwner?.name ?? "-"}</td>
                  <td className="text-right tabular-nums">{count(s.id, "NEW")}</td>
                  <td className="text-right tabular-nums">{count(s.id)}</td>
                  <td className="tabular-nums">{s.lastReceivedAt ? formatDateTimeKst(s.lastReceivedAt) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
