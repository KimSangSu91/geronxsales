import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { todayKst } from "@/lib/date";
import { CUSTOMER_STATUS_LABEL, CUSTOMER_STATUSES } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { CustomerTable, type TableRow } from "./customer-table";
import { getCustomerList, getFilterOptions } from "./list-data";
import { ListControls } from "./list-controls";
import { buildListHref, EMPTY_FILTERS, parseListParams } from "./list-params";

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requireUser();
  const params = parseListParams(await searchParams);
  const [list, options] = await Promise.all([getCustomerList(params), getFilterOptions()]);

  const rows: TableRow[] = list.rows.map(({ createdAt, ...r }) => ({
    ...r,
    createdOn: todayKst(createdAt),
  }));

  const tabs = [
    { status: undefined, label: "전체", count: list.total },
    ...CUSTOMER_STATUSES.map((s) => ({ status: s, label: CUSTOMER_STATUS_LABEL[s], count: list.counts[s] })),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* ① 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          고객사 <span className="ml-1 text-base font-normal text-muted-foreground">전체 {list.total}곳</span>
        </h1>
        <div className="flex gap-2">
          {/* 엑셀 내보내기는 4단계에서 구현 */}
          <button
            type="button"
            disabled
            title="4단계에서 구현"
            className={buttonVariants({ variant: "outline", className: "h-9" })}
          >
            <Download />
            엑셀 내보내기
          </button>
          <Link href="/customers/new" className={buttonVariants({ className: "h-9" })}>
            <Plus />
            고객사 등록
          </Link>
        </div>
      </div>

      {/* ② 상태 탭 */}
      <nav className="flex flex-wrap gap-x-1 gap-y-1 border-b">
        {tabs.map((t) => {
          const active = params.tab === t.status;
          return (
            <Link
              key={t.label}
              href={buildListHref(params, { tab: t.status, page: 1 })}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                active
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} <span className="tabular-nums">{t.count}</span>
            </Link>
          );
        })}
      </nav>

      {/* ③ 검색·필터 (주소가 바뀌면 입력 상태를 새로 맞추도록 key 지정) */}
      <ListControls key={buildListHref(params)} params={params} options={options} />

      {/* ④ 리스트 */}
      <CustomerTable
        rows={rows}
        params={params}
        today={todayKst()}
        resetHref={buildListHref(params, { ...EMPTY_FILTERS, q: undefined, page: 1 })}
      />

      {/* ⑤ 페이지네이션 */}
      {list.pageCount > 1 && (
        <div className="flex items-center justify-center gap-1">
          <PageLink href={buildListHref(params, { page: list.page - 1 })} disabled={list.page <= 1}>
            <ChevronLeft className="size-4" />
          </PageLink>
          {Array.from({ length: list.pageCount }, (_, i) => i + 1).map((n) => (
            <PageLink key={n} href={buildListHref(params, { page: n })} active={n === list.page}>
              {n}
            </PageLink>
          ))}
          <PageLink href={buildListHref(params, { page: list.page + 1 })} disabled={list.page >= list.pageCount}>
            <ChevronRight className="size-4" />
          </PageLink>
        </div>
      )}
    </div>
  );
}

function PageLink({
  href,
  active,
  disabled,
  children,
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls = cn(
    "inline-flex size-8 items-center justify-center rounded-md text-sm tabular-nums",
    active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
    disabled && "pointer-events-none opacity-40",
  );
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={href} className={cls} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
