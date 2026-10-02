import { requireUser } from "@/lib/auth";
import { customerCostLines, monthlyTotalAt } from "@/lib/billing";
import { formatDate, fromDbDate, todayKst } from "@/lib/date";
import { excelResponse, type Column } from "@/lib/excel";
import { ALERT_TYPE_LABEL } from "@/lib/alert-info";
import {
  CONTACT_ROLE_LABEL,
  CONTRACT_TYPE_LABEL,
  CUSTOMER_STATUS_LABEL,
  FACILITY_TYPE_LABEL,
  INBOUND_CHANNEL_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/labels";
import { withVat } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getCustomerList } from "../list-data";
import { parseListParams } from "../list-params";

// 고객사 목록 엑셀 내보내기 (화면정의서 1-4): 현재 탭·검색·필터 결과 전체
// 와이파이·서비스 계정 비밀번호는 넣지 않음
export async function GET(request: Request) {
  await requireUser();
  const url = new URL(request.url);
  const sp: Record<string, string[]> = {};
  for (const k of new Set(url.searchParams.keys())) sp[k] = url.searchParams.getAll(k);
  const list = await getCustomerList(parseListParams(sp));
  const customers = await prisma.customer.findMany({
    where: { id: { in: list.allIds } },
    include: {
      owner: { select: { name: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      contracts: { where: { state: "CURRENT" }, take: 1, include: { charges: true } },
      options: true,
      alerts: { where: { resolvedAt: null }, select: { type: true } },
    },
  });
  const byId = new Map(customers.map((c) => [c.id, c]));
  const today = todayKst();
  const month = today.slice(0, 7);
  const d = (v: Date | null) => (v ? formatDate(fromDbDate(v)) : "");

  const rows = list.allIds.map((id) => {
    const c = byId.get(id)!;
    const k = c.contracts[0];
    const primary = c.contacts.filter((x) => x.isPrimary);
    const monthly = monthlyTotalAt(customerCostLines({ contract: k ?? null, charges: k?.charges ?? [], options: c.options, extras: [] }), month);
    return {
      no: c.no,
      name: c.name,
      code: c.code ?? "",
      status: CUSTOMER_STATUS_LABEL[c.status],
      alerts: [...new Set(c.alerts.map((a) => ALERT_TYPE_LABEL[a.type]))].join(", "),
      facilityType: c.facilityType === "OTHER" && c.facilityTypeOther ? c.facilityTypeOther : FACILITY_TYPE_LABEL[c.facilityType],
      region: c.region,
      address: c.address ?? "",
      capacity: c.capacity ?? "",
      owner: c.owner.name,
      channel: c.inboundChannel ? INBOUND_CHANNEL_LABEL[c.inboundChannel] : "",
      referrer: c.referrer ?? "",
      primary: primary.map((x) => x.name).join(", "),
      contacts: c.contacts
        .map((x) => [x.name + (x.role ? `(${CONTACT_ROLE_LABEL[x.role]})` : ""), x.title, x.phone, x.email].filter(Boolean).join(" · "))
        .join("\n"),
      bizName: c.bizName ?? "",
      bizNo: c.bizNo ?? "",
      bizCeo: c.bizCeo ?? "",
      billingDay: c.billingDay ? `매월 ${c.billingDay}일` : "",
      paymentMethod: c.paymentMethod ? PAYMENT_METHOD_LABEL[c.paymentMethod] : "",
      taxInvoice: c.taxInvoice === null ? "" : c.taxInvoice ? "발행" : "미발행",
      taxInvoiceEmail: c.taxInvoiceEmail ?? "",
      contractType: k ? CONTRACT_TYPE_LABEL[k.contractType] : "",
      contractDate: k ? d(k.contractDate) : "",
      startDate: k ? d(k.startDate) : "",
      endDate: k ? d(k.endDate) : "",
      contractUsers: k?.contractUsers ?? "",
      autoRenew: k ? (k.autoRenew ? `Y (${k.autoRenewMonths ?? 12}개월)` : "N") : "",
      devices: k ? `허브 ${k.qtyHub} · 밴드 ${k.qtyBand} · 충전기 ${k.qtyCharger}` : "",
      monthly: monthly ?? "",
      monthlyVat: monthly !== null ? withVat(monthly) : "",
      createdAt: formatDate(todayKst(c.createdAt)),
      memo: c.memo ?? "",
    };
  });

  const columns: Column[] = [
    { header: "No", key: "no", width: 6 },
    { header: "시설명", key: "name", width: 24 },
    { header: "고객사 코드", key: "code" },
    { header: "상태", key: "status", width: 10 },
    { header: "알림", key: "alerts", width: 18 },
    { header: "시설 유형", key: "facilityType" },
    { header: "지역", key: "region", width: 10 },
    { header: "주소", key: "address", width: 30 },
    { header: "정원", key: "capacity", width: 8 },
    { header: "내부 담당자", key: "owner", width: 12 },
    { header: "유입 채널", key: "channel", width: 10 },
    { header: "소개처·수신 경로", key: "referrer", width: 16 },
    { header: "대표 담당자", key: "primary", width: 14 },
    { header: "시설 담당자 전체", key: "contacts", width: 40 },
    { header: "운영 법인명", key: "bizName", width: 18 },
    { header: "사업자등록번호", key: "bizNo", width: 15 },
    { header: "대표자명", key: "bizCeo", width: 10 },
    { header: "청구일", key: "billingDay", width: 10 },
    { header: "결제 수단", key: "paymentMethod", width: 10 },
    { header: "세금계산서", key: "taxInvoice", width: 10 },
    { header: "발행 이메일", key: "taxInvoiceEmail", width: 22 },
    { header: "계약 유형", key: "contractType", width: 10 },
    { header: "계약일", key: "contractDate", width: 12 },
    { header: "계약 시작일", key: "startDate", width: 12 },
    { header: "계약 종료일", key: "endDate", width: 12 },
    { header: "계약 인원", key: "contractUsers", width: 9 },
    { header: "자동연장", key: "autoRenew", width: 12 },
    { header: "제공 장비", key: "devices", width: 26 },
    { header: `이번 달 월 비용(공급가)`, key: "monthly", width: 14, money: true },
    { header: "VAT 포함", key: "monthlyVat", width: 14, money: true },
    { header: "등록일", key: "createdAt", width: 12 },
    { header: "메모", key: "memo", width: 30 },
  ];
  return excelResponse(`고객사_${today}.xlsx`, "고객사", columns, rows);
}
