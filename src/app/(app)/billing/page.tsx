import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { addMonthsYm } from "@/lib/billing";
import { todayKst } from "@/lib/date";
import { ensureMonthlyInvoicesIfStale } from "@/lib/invoice";
import { INVOICE_STATUS_LABEL } from "@/lib/labels";
import { formatWon, withVat } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CreateInvoicesButton } from "./create-invoices-button";
import { getInvoices } from "./invoice-data";
import { invoiceTotals } from "./invoice-shared";
import { InvoiceTable } from "./invoice-table";

// 청구 관리 (기능정의서 4-6): 월 선택 → 그 달 전체 고객사 청구 건
export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  await requireUser();
  await ensureMonthlyInvoicesIfStale();
  const sp = await searchParams;
  const thisMonth = todayKst().slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : thisMonth;
  const status = typeof sp.status === "string" && Object.hasOwn(INVOICE_STATUS_LABEL, sp.status) ? (sp.status as InvoiceStatus) : undefined;
  const noTax = sp.notax === "1";

  const all = await getInvoices({ month });
  const t = invoiceTotals(all);
  const rows = all.filter((r) => (!status || r.status === status) && (!noTax || !r.taxDoc));

  const href = (patch: { month?: string; status?: InvoiceStatus | null; notax?: boolean }) => {
    const q = new URLSearchParams();
    const m = patch.month ?? month;
    if (m !== thisMonth) q.set("month", m);
    const s = patch.status === null ? undefined : (patch.status ?? status);
    if (s) q.set("status", s);
    if (patch.notax ?? noTax) q.set("notax", "1");
    const qs = q.toString();
    return qs ? `/billing?${qs}` : "/billing";
  };

  const card = (label: string, amount: number, count: number | null, s: InvoiceStatus | null, tone?: string) => (
    <Link
      href={href({ status: s })}
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border bg-background px-4 py-3 hover:bg-muted/40",
        (s ?? null) === (status ?? null) && "ring-2 ring-foreground",
      )}
    >
      <span className="text-xs text-muted-foreground">
        {label}
        {count !== null && ` · ${count}건`}
      </span>
      <span className={cn("text-lg font-semibold tabular-nums", tone)}>{formatWon(amount)}원</span>
      <span className="text-xs text-muted-foreground tabular-nums">VAT {formatWon(withVat(amount))}원</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">청구 관리</h1>
          <div className="ml-2 flex items-center gap-1">
            <Link href={href({ month: addMonthsYm(month, -1) })} className="rounded p-1 hover:bg-muted" aria-label="이전 달">
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-20 text-center font-medium tabular-nums">{month.replace("-", ".")}</span>
            <Link href={href({ month: addMonthsYm(month, 1) })} className="rounded p-1 hover:bg-muted" aria-label="다음 달">
              <ChevronRight className="size-4" />
            </Link>
            {month !== thisMonth && (
              <Link href={href({ month: thisMonth })} className="ml-1 text-xs text-muted-foreground underline underline-offset-4">
                이번 달
              </Link>
            )}
          </div>
        </div>
        {month === thisMonth && <CreateInvoicesButton />}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {card("예정 금액 (전체)", t.planned, all.length, null)}
        {card(INVOICE_STATUS_LABEL.BEFORE, t.byStatus.BEFORE.amount, t.byStatus.BEFORE.count, "BEFORE")}
        {card(INVOICE_STATUS_LABEL.BILLED, t.byStatus.BILLED.amount, t.byStatus.BILLED.count, "BILLED", "text-emerald-700")}
        {card(INVOICE_STATUS_LABEL.PAID, t.byStatus.PAID.amount, t.byStatus.PAID.count, "PAID", "text-emerald-800")}
        {card(INVOICE_STATUS_LABEL.UNPAID, t.byStatus.UNPAID.amount, t.byStatus.UNPAID.count, "UNPAID", "text-red-600")}
      </div>

      <section className="rounded-lg border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <h2 className="font-semibold">
            {month.replace("-", ".")} 청구 건 <span className="text-sm font-normal text-muted-foreground">{rows.length}건</span>
          </h2>
          <Link
            href={href({ notax: !noTax })}
            className={cn("rounded-full border px-3 py-0.5 text-xs", noTax ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
          >
            세금계산서 미업로드만
          </Link>
        </div>
        <InvoiceTable rows={rows} showCustomer />
      </section>
    </div>
  );
}
