import Link from "next/link";
import { AlertChip } from "@/components/alert-chip";
import { CustomerStatusBadge } from "@/components/customer-status-badge";
import { alertHref } from "@/lib/alert-info";
import { loadOpenAlerts, syncAlertsIfStale } from "@/lib/alerts";
import { requireUser } from "@/lib/auth";
import { todayKst } from "@/lib/date";
import { ensureMonthlyInvoicesIfStale, monthLines } from "@/lib/invoice";
import { CUSTOMER_STATUSES, INVOICE_STATUS_LABEL } from "@/lib/labels";
import { formatWon, withVat } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { getInvoices } from "./billing/invoice-data";
import { invoiceTotals } from "./billing/invoice-shared";

const Won = ({ v, big }: { v: number; big?: boolean }) => (
  <span className="tabular-nums">
    <span className={cn(big ? "text-xl font-semibold" : "font-medium")}>{formatWon(v)}원</span>
    <span className="ml-1 text-xs text-muted-foreground">VAT {formatWon(withVat(v))}</span>
  </span>
);

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
    </section>
  );
}

// 대시보드 (기능정의서 4-12)
export default async function DashboardPage() {
  await requireUser();
  await ensureMonthlyInvoicesIfStale();
  await syncAlertsIfStale();
  const month = todayKst().slice(0, 7);

  const [grouped, alerts, invoices, active, onboarding] = await Promise.all([
    prisma.customer.groupBy({ by: ["status"], _count: { _all: true } }),
    loadOpenAlerts(),
    getInvoices({ month }),
    prisma.customer.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.customer.findMany({
      where: { status: "ONBOARDING" },
      select: {
        id: true,
        name: true,
        installDate: true,
        checklist: { where: { closureId: null }, select: { done: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // 이번 달 예상 금액 = 사용중 고객사의 이번 달 월 비용 + 청구월이 이번 달인 일시 비용 (공급가, 일할 계산 없음)
  const expected = await Promise.all(
    active.map(async (c) => {
      const lines = await monthLines(c.id, month);
      const monthly = lines.filter((l) => l.type === "MONTHLY").reduce((s, l) => s + l.amount, 0);
      const oneTime = lines.filter((l) => l.type === "ONE_TIME").reduce((s, l) => s + l.amount, 0);
      return { ...c, monthly, oneTime };
    }),
  );
  const sumMonthly = expected.reduce((s, x) => s + x.monthly, 0);
  const sumOneTime = expected.reduce((s, x) => s + x.oneTime, 0);
  const t = invoiceTotals(invoices);
  const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const total = grouped.reduce((s, g) => s + g._count._all, 0);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">대시보드</h1>

      {/* 상태별 고객사 수 */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
        <Link href="/customers" className="flex flex-col gap-1 rounded-lg border bg-background px-3 py-2.5 hover:bg-muted/40">
          <span className="text-xs text-muted-foreground">전체</span>
          <span className="text-lg font-semibold tabular-nums">{total}</span>
        </Link>
        {CUSTOMER_STATUSES.map((s) => (
          <Link key={s} href={`/customers?tab=${s}`} className="flex flex-col gap-1 rounded-lg border bg-background px-3 py-2.5 hover:bg-muted/40">
            <CustomerStatusBadge status={s} />
            <span className="text-lg font-semibold tabular-nums">{count(s)}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 이번 달 예상 금액 */}
        <Card title={`이번 달(${month.replace("-", ".")}) 예상 금액`}>
          <div className="flex flex-col gap-1">
            <Won v={sumMonthly + sumOneTime} big />
            <p className="text-sm text-muted-foreground">
              월 비용 {formatWon(sumMonthly)}원 · 일시 비용 {formatWon(sumOneTime)}원 · 사용중 {active.length}곳
            </p>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">고객사별 내역</summary>
            <table className="mt-2 w-full table-fixed">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 font-medium">고객사</th>
                  <th className="py-1 text-right font-medium">월 비용</th>
                  <th className="py-1 text-right font-medium">일시 비용</th>
                  <th className="py-1 text-right font-medium">합계</th>
                </tr>
              </thead>
              <tbody>
                {expected
                  .filter((x) => x.monthly + x.oneTime > 0)
                  .map((x) => (
                    <tr key={x.id} className="border-t">
                      <td className="truncate py-1">
                        <Link href={`/customers/${x.id}?tab=contract`} className="hover:underline">
                          {x.name}
                        </Link>
                      </td>
                      <td className="py-1 text-right tabular-nums">{formatWon(x.monthly)}</td>
                      <td className="py-1 text-right tabular-nums">{formatWon(x.oneTime)}</td>
                      <td className="py-1 text-right font-medium tabular-nums">{formatWon(x.monthly + x.oneTime)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {expected.some((x) => x.monthly + x.oneTime === 0) && (
              <p className="mt-1 text-xs text-muted-foreground">
                이번 달 금액이 없는 사용중 고객사 {expected.filter((x) => x.monthly + x.oneTime === 0).length}곳
              </p>
            )}
          </details>
        </Card>

        {/* 이번 달 청구 현황 */}
        <Card
          title="이번 달 청구 현황"
          action={
            <Link href="/billing" className="text-xs text-muted-foreground underline underline-offset-4">
              청구 관리 →
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            {(["BEFORE", "BILLED", "PAID", "UNPAID"] as const).map((s) => (
              <Link key={s} href={`/billing?status=${s}`} className="flex flex-col rounded-md border px-3 py-2 hover:bg-muted/40">
                <span className="text-xs text-muted-foreground">
                  {INVOICE_STATUS_LABEL[s]} · {t.byStatus[s].count}건
                </span>
                <span className={cn("font-semibold tabular-nums", s === "UNPAID" && t.byStatus[s].count > 0 && "text-red-600")}>
                  {formatWon(t.byStatus[s].amount)}원
                </span>
              </Link>
            ))}
          </div>
          {invoices.length === 0 && <p className="mt-2 text-xs text-muted-foreground">이번 달 청구 건이 없습니다</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 알림 목록 */}
        <div className="xl:col-span-2">
          <Card title={`알림 ${alerts.length}건`}>
            {alerts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">처리할 알림이 없습니다</p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {alerts.map((a) => (
                  <li key={a.id}>
                    <Link href={alertHref(a)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
                      <AlertChip type={a.type} level={a.level} />
                      <span className="min-w-0 flex-1 truncate">
                        {a.customerName && <b className="font-medium">{a.customerName}</b>}
                        {a.customerName && " · "}
                        <span className="text-muted-foreground">{a.message}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* 도입준비 체크리스트 진행률 */}
        <Card title={`도입준비 ${onboarding.length}곳`}>
          {onboarding.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">도입준비 중인 고객사가 없습니다</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {onboarding.map((c) => {
                const done = c.checklist.filter((e) => e.done).length;
                const all = c.checklist.length;
                const pct = all ? Math.round((done / all) * 100) : 0;
                return (
                  <li key={c.id}>
                    <Link href={`/customers/${c.id}?tab=checklist`} className="flex flex-col gap-1 hover:opacity-80">
                      <span className="flex justify-between text-sm">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {done}/{all}
                        </span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className={cn("block h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-foreground/70")} style={{ width: `${pct}%` }} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
