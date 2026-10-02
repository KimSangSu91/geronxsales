import Link from "next/link";
import { formatWon } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ensureMonthlyInvoicesIfStale } from "@/lib/invoice";
import { getInvoices } from "../../../billing/invoice-data";
import { invoiceTotals } from "../../../billing/invoice-shared";
import { InvoiceTable } from "../../../billing/invoice-table";

// 고객사 상세 > 청구 탭 (화면정의서 4-3): 연도별 청구 건 + 누적 합계
export async function BillingTab({ customerId, year, thisYear }: { customerId: string; year: number; thisYear: number }) {
  await ensureMonthlyInvoicesIfStale();
  const rows = await getInvoices({ customerId, year });
  const t = invoiceTotals(rows);
  const base = `/customers/${customerId}?tab=billing`;
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2].filter((y) => y >= 2024);

  return (
    <section className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-1 text-sm">
          {years.map((y) => (
            <Link
              key={y}
              href={`${base}&year=${y}`}
              className={cn("rounded-full px-2.5 py-0.5", y === year ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
            >
              {y}년
            </Link>
          ))}
        </div>
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
