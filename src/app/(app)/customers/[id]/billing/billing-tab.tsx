import { formatWon } from "@/lib/money";
import { cn } from "@/lib/utils";
import { fromDbDate } from "@/lib/date";
import { ensureMonthlyInvoicesIfStale } from "@/lib/invoice";
import { prisma } from "@/lib/prisma";
import { getInvoices } from "../../../billing/invoice-data";
import { invoiceTotals } from "../../../billing/invoice-shared";
import { InvoiceTable } from "../../../billing/invoice-table";
import { YearSelect } from "./year-select";

// 고객사 상세 > 청구 탭 (화면정의서 4-3): 연도별 청구 건 + 누적 합계
export async function BillingTab({ customerId, year, thisYear }: { customerId: string; year: number; thisYear: number }) {
  await ensureMonthlyInvoicesIfStale();
  const rows = await getInvoices({ customerId, year });
  const t = invoiceTotals(rows);
  const base = `/customers/${customerId}?tab=billing`;
  // 연도 목록: 첫 청구 건 연도 ~ 올해 (최신순)
  const first = await prisma.invoice.findFirst({ where: { customerId }, orderBy: { billingMonth: "asc" }, select: { billingMonth: true } });
  const firstYear = first ? Number(fromDbDate(first.billingMonth).slice(0, 4)) : thisYear;
  const shown = year >= 2000 && year <= thisYear + 1 ? year : thisYear; // 주소에 이상한 연도가 들어와도 목록이 커지지 않도록
  const from = Math.min(firstYear, thisYear, shown);
  const to = Math.max(thisYear, shown);
  const years = Array.from({ length: to - from + 1 }, (_, i) => to - i);

  return (
    <section className="rounded-lg border bg-background">
      <div className="card-head flex-wrap">
        <YearSelect base={base} year={year} years={years} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          <span>
            <span className="text-muted-foreground">누적 예정</span> {formatWon(t.planned)}
          </span>
          <span>
            <span className="text-muted-foreground">청구 완료</span> {formatWon(t.billed)}
          </span>
          <span>
            <span className="text-muted-foreground">입금 확인</span> {formatWon(t.paid)}
          </span>
          <span className={cn(t.unpaid > 0 && "font-medium text-red-600")}>
            <span className="text-muted-foreground">미납</span> {formatWon(t.unpaid)}
          </span>
        </div>
      </div>
      <InvoiceTable rows={rows} />
    </section>
  );
}
