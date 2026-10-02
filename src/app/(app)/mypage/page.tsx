import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AlertChip } from "@/components/alert-chip";
import { CustomerStatusBadge } from "@/components/customer-status-badge";
import { LEVEL_ORDER } from "@/lib/alert-info";
import { requireUser } from "@/lib/auth";
import { addDays, dDayText, formatDate, formatDateTimeKst, fromDbDate, kstStartOfDay, todayKst } from "@/lib/date";
import { USER_ROLE_LABEL } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { deviceLabel } from "@/lib/user-agent";
import { cn } from "@/lib/utils";
import { PasswordForm, PhoneForm } from "./my-forms";

const LOG_PAGE = 20;

// 마이페이지 (화면정의서 9장)
export default async function MyPage({ searchParams }: PageProps<"/mypage">) {
  const me = await requireUser();
  const sp = await searchParams;
  const since = kstStartOfDay(addDays(todayKst(), -90));
  const logWhere = { userId: me.id, createdAt: { gte: since } };
  const [logTotal, customers] = await Promise.all([
    prisma.loginLog.count({ where: logWhere }),
    prisma.customer.findMany({
      where: { ownerId: me.id },
      orderBy: { no: "desc" },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        contracts: { where: { state: "CURRENT" }, take: 1, select: { endDate: true } },
        alerts: { where: { resolvedAt: null }, select: { type: true, level: true, message: true } },
      },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(logTotal / LOG_PAGE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pageCount);
  const logs = await prisma.loginLog.findMany({
    where: logWhere,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * LOG_PAGE,
    take: LOG_PAGE,
  });
  const today = todayKst();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">마이페이지</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-lg border bg-background">
          <div className="card-head">
            <h2>내 정보</h2>
          </div>
          <dl className="grid grid-cols-1 gap-y-3 px-5 py-4 text-sm">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">이메일</dt>
              <dd>{me.email}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">이름</dt>
              <dd>{me.name}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">권한</dt>
              <dd>{USER_ROLE_LABEL[me.role]}</dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="w-24 shrink-0 pt-1.5 text-muted-foreground">연락처</dt>
              <dd className="flex-1">
                <PhoneForm initial={me.phone ?? ""} />
              </dd>
            </div>
          </dl>
        </section>

        <section id="password" className="rounded-lg border bg-background">
          <div className="card-head">
            <h2>비밀번호 변경</h2>
          </div>
          <div className="px-5 py-4">
            <PasswordForm />
          </div>
        </section>
      </div>

      <section className="rounded-lg border bg-background">
        <div className="card-head">
          <h2>
            내 담당 고객사 <span className="text-sm font-normal text-muted-foreground">{customers.length}곳</span>
          </h2>
        </div>
        {customers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">담당 고객사가 없습니다</p>
        ) : (
          <table className="data-table w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-40" />
              <col className="w-56" />
            </colgroup>
            <thead>
              <tr className="text-left">
                <th>시설명</th>
                <th>상태</th>
                <th>알림</th>
                <th>계약 종료일</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const end = c.contracts[0] ? fromDbDate(c.contracts[0].endDate) : null;
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="truncate">
                      <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      {c.code && <span className="ml-1.5 text-xs text-muted-foreground">{c.code}</span>}
                    </td>
                    <td>
                      <CustomerStatusBadge status={c.status} />
                    </td>
                    <td>
                      <span className="flex gap-1">
                        {[...c.alerts]
                          .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
                          .map((a, i) => (
                            <AlertChip key={i} type={a.type} level={a.level} compact title={a.message} />
                          ))}
                      </span>
                    </td>
                    <td className="tabular-nums">
                      {end ? (
                        <>
                          {formatDate(end)} <span className="text-xs text-muted-foreground">{dDayText(end, today)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border bg-background">
        <div className="card-head">
          <h2>
            로그인 기록 <span className="text-sm font-normal text-muted-foreground">최근 90일 {logTotal}건</span>
          </h2>
          {pageCount > 1 && (
            <span className="flex items-center gap-1 text-sm tabular-nums">
              <PageLink page={page - 1} disabled={page <= 1}>
                <ChevronLeft className="size-4" />
              </PageLink>
              {page} / {pageCount}
              <PageLink page={page + 1} disabled={page >= pageCount}>
                <ChevronRight className="size-4" />
              </PageLink>
            </span>
          )}
        </div>
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">로그인 기록이 없습니다</p>
        ) : (
          <table className="data-table w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>일시</th>
                <th>IP</th>
                <th>기기 · 브라우저</th>
                <th className="text-right">결과</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="tabular-nums">{formatDateTimeKst(l.createdAt)}</td>
                  <td className="tabular-nums">{l.ip ?? "-"}</td>
                  <td>{deviceLabel(l.userAgent)}</td>
                  <td className={cn("text-right", l.success ? "text-emerald-700" : "text-destructive")}>{l.success ? "성공" : "실패"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function PageLink({ page, disabled, children }: { page: number; disabled: boolean; children: React.ReactNode }) {
  const cls = cn("inline-flex size-7 items-center justify-center rounded-md hover:bg-muted", disabled && "pointer-events-none opacity-40");
  return disabled ? (
    <span className={cls}>{children}</span>
  ) : (
    <Link href={`/mypage?page=${page}`} className={cls} scroll={false}>
      {children}
    </Link>
  );
}
