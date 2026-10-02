"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react";
import type { ContactRole, CustomerStatus, FacilityType } from "@/generated/prisma/enums";
import { AlertBadge } from "@/components/alert-badge";
import { CustomerStatusBadge } from "@/components/customer-status-badge";
import type { BadgeKind } from "@/lib/renewal";
import { dDayLabel, formatDate } from "@/lib/date";
import { CONTACT_ROLE_LABEL, FACILITY_TYPE_LABEL } from "@/lib/labels";
import { formatWon, withVat } from "@/lib/money";
import { cn } from "@/lib/utils";
import { buildListHref, type ListParams, type SortKey } from "./list-params";

export type TableRow = {
  id: string;
  no: number;
  name: string;
  code: string | null;
  status: CustomerStatus;
  facilityType: FacilityType;
  facilityTypeOther: string | null;
  region: string;
  serviceUrl: string | null;
  createdOn: string;
  owner: { name: string; isActive: boolean };
  primaryContact: { name: string; role: ContactRole | null; phone: string | null } | null;
  primaryCount: number;
  endDate: string | null;
  monthly: number | null;
  badges: BadgeKind[];
};

type Props = { rows: TableRow[]; params: ListParams; today: string; resetHref: string };

function SortHeader({ label, sortKey, params }: { label: string; sortKey: SortKey; params: ListParams }) {
  const active = params.sort === sortKey;
  const nextDir = active && params.dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : params.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={buildListHref(params, { sort: sortKey, dir: nextDir, page: 1 })}
      className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
    >
      {label}
      <Icon className={cn("size-3.5", !active && "opacity-40")} />
    </Link>
  );
}

export function CustomerTable({ rows, params, today, resetHref }: Props) {
  const router = useRouter();

  const th = "px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";
  const td = "px-3 py-3 align-middle";

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className={th}><SortHeader label="No" sortKey="no" params={params} /></th>
            <th className={th}><SortHeader label="시설명" sortKey="name" params={params} /></th>
            <th className={th}><SortHeader label="상태" sortKey="status" params={params} /></th>
            <th className={th}>알림</th>
            <th className={th}>시설 유형 · 지역</th>
            <th className={th}>대표 담당자</th>
            <th className={th}><SortHeader label="내부 담당자" sortKey="owner" params={params} /></th>
            <th className={th}><SortHeader label="계약 종료일" sortKey="endDate" params={params} /></th>
            <th className={cn(th, "text-right")}><SortHeader label="월 비용" sortKey="monthly" params={params} /></th>
            <th className={th}><SortHeader label="등록일" sortKey="createdAt" params={params} /></th>
            <th className={cn(th, "text-center")}>서비스</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} className="py-16 text-center text-muted-foreground">
                <p>조건에 맞는 고객사가 없습니다</p>
                <Link href={resetHref} className="mt-2 inline-block text-sm text-foreground underline underline-offset-4">
                  필터 초기화
                </Link>
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => router.push(`/customers/${r.id}`)}
              className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40"
            >
              <td className={cn(td, "text-muted-foreground tabular-nums")}>{r.no}</td>
              <td className={td}>
                <p className="font-semibold">{r.name}</p>
                {r.code && <p className="text-xs text-muted-foreground">{r.code}</p>}
              </td>
              <td className={td}><CustomerStatusBadge status={r.status} /></td>
              {/* 알림 배지: 아이콘만, 마우스를 올리면 내용 (나머지 알림 종류는 3단계) */}
              <td className={td}>
                <span className="flex gap-1">
                  {r.badges.map((b) => (
                    <AlertBadge key={b} kind={b} compact />
                  ))}
                </span>
              </td>
              <td className={cn(td, "whitespace-nowrap")}>
                {r.facilityType === "OTHER" && r.facilityTypeOther
                  ? r.facilityTypeOther
                  : FACILITY_TYPE_LABEL[r.facilityType]}{" "}
                · {r.region}
              </td>
              <td className={td}>
                {r.primaryContact ? (
                  <>
                    <p className="whitespace-nowrap">
                      {r.primaryContact.name}
                      {r.primaryContact.role && (
                        <span className="text-muted-foreground">({CONTACT_ROLE_LABEL[r.primaryContact.role]})</span>
                      )}
                      {r.primaryCount > 1 && (
                        <span className="ml-1 text-xs text-muted-foreground">외 {r.primaryCount - 1}명</span>
                      )}
                    </p>
                    {r.primaryContact.phone && (
                      <p className="text-xs text-muted-foreground tabular-nums">{r.primaryContact.phone}</p>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className={cn(td, "whitespace-nowrap")}>
                {r.owner.isActive ? (
                  r.owner.name
                ) : (
                  <>
                    <p className="text-muted-foreground">{r.owner.name}</p>
                    <p className="text-xs text-red-600">재배정 필요</p>
                  </>
                )}
              </td>
              <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                {r.endDate ? (
                  <>
                    {formatDate(r.endDate)}{" "}
                    <span className="text-xs text-muted-foreground">{dDayLabel(r.endDate, today)}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className={cn(td, "text-right whitespace-nowrap tabular-nums")}>
                {r.monthly !== null ? (
                  <>
                    <p>{formatWon(r.monthly)}원</p>
                    <p className="text-xs text-muted-foreground">VAT {formatWon(withVat(r.monthly))}원</p>
                  </>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
              <td className={cn(td, "whitespace-nowrap tabular-nums")}>{formatDate(r.createdOn)}</td>
              <td className={cn(td, "text-center")}>
                {r.serviceUrl && /^https?:\/\//i.test(r.serviceUrl) ? (
                  <a
                    href={r.serviceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="서비스 페이지 열기"
                    className="inline-flex rounded-md p-1.5 hover:bg-muted"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                ) : (
                  <span title="서비스 URL 미등록" className="inline-flex p-1.5 text-muted-foreground/40">
                    <ExternalLink className="size-4" />
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
