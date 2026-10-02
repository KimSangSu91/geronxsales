"use client";

import { useState } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import type { ContactRole } from "@/generated/prisma/enums";
import { dDayText, formatDate } from "@/lib/date";
import { CONTACT_ROLE_LABEL } from "@/lib/labels";
import { formatWon, withVat } from "@/lib/money";
import { cn } from "@/lib/utils";

export type SummaryData = {
  earlyStage: boolean; // 진행대기·미전환: 계약 카드 대신 유입 채널·최근 활동일
  primaryContacts: { name: string; role: ContactRole | null; phone: string | null }[]; // 여러 명 가능
  owner: { name: string; isActive: boolean };
  contract: { endDate: string; contractUsers: number } | null;
  monthly: number | null;
  inboundChannel: string | null;
  lastActivity: string | null;
  primaryAccount: string | null;
  inUseAccounts: number;
  today: string;
};

function Card({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-lg border bg-background px-4 py-3", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

const Empty = () => <span className="text-muted-foreground">-</span>;

// 상세 상단 요약 카드 (화면정의서 3-4)
export function SummaryCards({ data, accountsHref }: { data: SummaryData; accountsHref: string }) {
  const [showPhone, setShowPhone] = useState(false);
  const [first, ...rest] = data.primaryContacts;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Card label="대표 담당자">
        {first ? (
          <>
            <button
              type="button"
              onClick={() => setShowPhone(!showPhone)}
              className="truncate text-left font-medium hover:underline"
              title="연락처 보기"
            >
              {first.name}
              {first.role && <span className="font-normal text-muted-foreground">({CONTACT_ROLE_LABEL[first.role]})</span>}
              {rest.length > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">외 {rest.length}명</span>}
            </button>
            {showPhone &&
              data.primaryContacts.map((c, i) => (
                <p key={i} className="flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
                  {rest.length > 0 && <span className="mr-1">{c.name}</span>}
                  {c.phone ?? "연락처 없음"}
                  {c.phone && <CopyButton text={c.phone} label="연락처 복사" />}
                </p>
              ))}
          </>
        ) : (
          <Empty />
        )}
      </Card>

      <Card label="내부 담당자">
        {data.owner.isActive ? (
          <span className="font-medium">{data.owner.name}</span>
        ) : (
          <>
            <span className="text-muted-foreground">{data.owner.name}</span>
            <p className="text-xs text-red-600">재배정 필요</p>
          </>
        )}
      </Card>

      {data.earlyStage ? (
        <>
          <Card label="유입 채널">{data.inboundChannel ?? <Empty />}</Card>
          <Card label="최근 활동일" className="xl:col-span-2">
            {data.lastActivity ? formatDate(data.lastActivity) : <Empty />}
          </Card>
        </>
      ) : (
        <>
          <Card label="계약 기간">
            {data.contract ? (
              <span className="tabular-nums">
                ~{formatDate(data.contract.endDate)}{" "}
                <span className="text-xs text-muted-foreground">{dDayText(data.contract.endDate, data.today)}</span>
              </span>
            ) : (
              <Empty />
            )}
          </Card>
          <Card label="계약 인원">{data.contract ? `${data.contract.contractUsers}명` : <Empty />}</Card>
          <Card label="월 비용">
            {data.monthly !== null ? (
              <>
                <p className="tabular-nums">{formatWon(data.monthly)}원</p>
                <p className="text-xs text-muted-foreground tabular-nums">VAT {formatWon(withVat(data.monthly))}원</p>
              </>
            ) : data.contract ? (
              <span className="text-muted-foreground">월 비용 없음</span>
            ) : (
              <Empty />
            )}
          </Card>
        </>
      )}

      <Card label="관리자 계정">
        {data.primaryAccount ? (
          <span className="flex items-center gap-0.5">
            <span className="truncate font-medium">{data.primaryAccount}</span>
            <CopyButton text={data.primaryAccount} label="계정 ID 복사" />
          </span>
        ) : (
          <Empty />
        )}
        <Link href={accountsHref} className="block text-xs text-muted-foreground hover:underline">
          사용 계정 {data.inUseAccounts}개
        </Link>
      </Card>
    </div>
  );
}
