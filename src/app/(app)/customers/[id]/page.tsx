import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { UnsavedChangesProvider } from "@/components/unsaved-changes";
import type { CustomerStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { todayKst } from "@/lib/date";
import { FACILITY_TYPE_LABEL, INBOUND_CHANNEL_LABEL } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { getChecklistData } from "./checklist/checklist-data";
import { ChecklistTab } from "./checklist/checklist-tab";
import { getContractTabData } from "./contract/contract-data";
import { ContractTab } from "./contract/contract-tab";
import { getCustomerDetail } from "./detail-data";
import { getDocumentsData } from "./documents/documents-data";
import { DocumentsTab } from "./documents/documents-tab";
import { getStatusFacts } from "./status/status-data";
import { StatusChanger } from "./status/status-changer";
import { getHistoryPage, getRecentHistory, parseHistoryFilters } from "./history/history-data";
import { HistoryPanel } from "./history/history-panel";
import { HistoryTab } from "./history/history-tab";
import { BasicInfoTab } from "./info/basic-info-tab";
import { SECTION_KEYS, type SectionKey } from "./info/sections";
import { SummaryCards } from "./summary-cards";

const TABS = [
  { key: "info", label: "기본정보" },
  { key: "contract", label: "계약·비용" },
  { key: "billing", label: "청구" },
  { key: "checklist", label: "체크리스트" },
  { key: "documents", label: "문서" },
  { key: "devices", label: "장비" },
  { key: "history", label: "히스토리" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// 아직 만들지 않은 탭과 구현 단계
const NOT_READY: Partial<Record<TabKey, string>> = {
  billing: "3단계",
  devices: "2단계",
};

// 처음 열리는 탭 (화면정의서 3-5) — 아직 없는 탭이면 기본정보
// 미전환·계약종료·계약해지·기타는 회수·종료 체크리스트가 미완료면 체크리스트
function defaultTab(status: CustomerStatus, hasOpenClosure: boolean): TabKey {
  const closing = ["NOT_CONVERTED", "ENDED", "TERMINATED", "OTHER"].includes(status);
  const preferred: TabKey =
    status === "ONBOARDING" || (closing && hasOpenClosure)
      ? "checklist"
      : status === "TRIAL" || status === "ACTIVE"
        ? "contract"
        : "info";
  return NOT_READY[preferred] ? "info" : preferred;
}

export default async function CustomerDetailPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const [detail, owners] = await Promise.all([
    getCustomerDetail(id),
    prisma.user.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!detail) notFound();
  const c = detail.customer;

  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : defaultTab(c.status, !!detail.openClosure);
  const today = todayKst();
  // 히스토리 탭에서는 우측 패널을 숨김(중복 표시 방지), 그 외에는 최근 10건
  const historyFilters = parseHistoryFilters(sp);
  const [recent, historyPage, statusFacts, checklist, contractData, documentsData] = await Promise.all([
    tab === "history" ? null : getRecentHistory(c.id, user.id),
    tab === "history" ? getHistoryPage(c.id, user.id, historyFilters) : null,
    getStatusFacts(prisma, c.id),
    tab === "checklist" ? getChecklistData(c.id) : null,
    tab === "contract" ? getContractTabData(c.id, c.status) : null,
    tab === "documents" ? getDocumentsData(c.id) : null,
  ]);

  const editParam = typeof sp.edit === "string" ? sp.edit : undefined;
  const editSection = SECTION_KEYS.includes(editParam as SectionKey) ? (editParam as SectionKey) : undefined;

  const base = `/customers/${c.id}`;
  const serviceUrl = c.serviceUrl && /^https?:\/\//i.test(c.serviceUrl) ? c.serviceUrl : null;
  const primaryContacts = c.contacts.filter((x) => x.isPrimary);
  const primaryAccount = c.accounts.find((a) => a.isPrimary) ?? null;

  // 안내 배너 (화면정의서 3-3) — 나머지 배너는 해당 기능 구현 시 추가
  const banners: { tone: "warn" | "danger"; text: string; action?: { label: string; href: string } }[] = [];
  // 필수 서류 누락 (도입준비·사용중) — 화면정의서 3-3
  if ((c.status === "ONBOARDING" || c.status === "ACTIVE") && statusFacts) {
    const missingDocs = [!statusFacts.docs.contract && "계약서", !statusFacts.docs.deviceReceipt && "디바이스 인수증"].filter(Boolean);
    if (missingDocs.length) {
      banners.push({
        tone: "danger",
        text: `필수 서류가 누락되었습니다: ${missingDocs.join(", ")}`,
        action: { label: "문서 탭으로", href: `${base}?tab=documents` },
      });
    }
  }
  if (detail.openClosure) {
    banners.push({
      tone: "warn",
      text: `장비 회수 등 종료 처리가 완료되지 않았습니다. (${detail.openClosure.done}/${detail.openClosure.total})`,
      action: { label: "체크리스트 탭으로", href: `${base}?tab=checklist` },
    });
  }
  if (!c.owner.isActive) {
    banners.push({
      tone: "warn",
      text: "내부 담당자가 비활성 상태입니다. 담당자를 재배정하세요.",
      action: { label: "재배정", href: `${base}?tab=info&edit=basic` },
    });
  }

  return (
    <UnsavedChangesProvider>
      <div className="flex flex-col gap-5">
        {/* 브레드크럼 */}
        <p className="text-sm text-muted-foreground">
          <Link href="/customers" className="hover:text-foreground">
            고객사
          </Link>{" "}
          › {c.name}
        </p>

        {/* ① 헤더 */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-semibold">{c.name}</h1>
              {c.code && <span className="text-muted-foreground">{c.code}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {c.facilityType === "OTHER" && c.facilityTypeOther
                  ? c.facilityTypeOther
                  : FACILITY_TYPE_LABEL[c.facilityType]}{" "}
                · {c.region}
              </span>
              <StatusChanger customerId={c.id} status={c.status} facts={statusFacts!} today={today} />
            </div>
          </div>
          {serviceUrl ? (
            <a
              href={serviceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", className: "h-9" })}
            >
              서비스 페이지 이동
              <ExternalLink />
            </a>
          ) : (
            <span
              title="기본정보에서 URL을 등록하세요"
              className={buttonVariants({ variant: "outline", className: "h-9 cursor-not-allowed opacity-50" })}
            >
              서비스 페이지 이동
              <ExternalLink />
            </span>
          )}
        </div>

        {/* ② 안내 배너 */}
        {banners.map((b) => (
          <div
            key={b.text}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm",
              b.tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900",
            )}
          >
            <TriangleAlert className="size-4 shrink-0" />
            <span className="flex-1">{b.text}</span>
            {b.action && (
              <Link href={b.action.href} className="font-medium underline underline-offset-4">
                {b.action.label}
              </Link>
            )}
          </div>
        ))}

        {/* ③ 요약 카드 */}
        <SummaryCards
          accountsHref={`${base}?tab=info#section-accounts`}
          data={{
            earlyStage: c.status === "PENDING" || c.status === "NOT_CONVERTED",
            primaryContacts: primaryContacts.map((x) => ({ name: x.name, role: x.role, phone: x.phone })),
            owner: { name: c.owner.name, isActive: c.owner.isActive },
            contract: detail.contract,
            monthly: detail.monthly,
            inboundChannel: c.inboundChannel ? INBOUND_CHANNEL_LABEL[c.inboundChannel] : null,
            lastActivity: detail.lastActivity,
            primaryAccount: primaryAccount?.loginId ?? null,
            inUseAccounts: c.accounts.filter((a) => a.status === "IN_USE").length,
            today,
          }}
        />

        {/* ④ 탭 */}
        <nav className="flex flex-wrap gap-x-1 border-b">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`${base}?tab=${t.key}`}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                tab === t.key
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {tab === "info" ? (
              <BasicInfoTab detail={detail} owners={owners} editSection={editSection} />
            ) : tab === "contract" && contractData ? (
              <ContractTab customerId={c.id} status={c.status} data={contractData} today={today} />
            ) : tab === "documents" && documentsData ? (
              <DocumentsTab customerId={c.id} data={documentsData} />
            ) : tab === "checklist" && checklist ? (
              <ChecklistTab customerId={c.id} data={checklist} today={today} />
            ) : tab === "history" && historyPage ? (
              <HistoryTab
                customerId={c.id}
                basePath={base}
                items={historyPage.items}
                total={historyPage.total}
                filters={historyFilters}
                users={owners}
                today={today}
              />
            ) : (
              <div className="flex h-60 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                준비 중입니다 · {NOT_READY[tab]}에서 구현
              </div>
            )}
          </div>
          {recent && (
            <HistoryPanel
              customerId={c.id}
              items={recent}
              today={today}
              defaultCollapsed={user.historyPanelCollapsed}
              historyHref={`${base}?tab=history`}
            />
          )}
        </div>
      </div>
    </UnsavedChangesProvider>
  );
}
