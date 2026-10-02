import { requireUser } from "@/lib/auth";
import { formatDate, todayKst } from "@/lib/date";
import { excelResponse, type Column } from "@/lib/excel";
import { INVOICE_STATUS_LABEL } from "@/lib/labels";
import { withVat } from "@/lib/money";
import { getInvoices } from "../invoice-data";
import { finalAmount } from "../invoice-shared";

// 청구 관리 엑셀 내보내기 (기능정의서 4-6): 선택한 달의 청구 건 전체
export async function GET(request: Request) {
  await requireUser();
  const m = new URL(request.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : todayKst().slice(0, 7);
  const invoices = await getInvoices({ month });

  const rows = invoices.map((r) => ({
    customer: r.customerName,
    month: r.month.replace("-", "."),
    items: r.lines.map((l) => `${l.name} ${l.amount.toLocaleString("ko-KR")}`).join("\n"),
    planned: r.planned,
    adjusted: r.adjusted ?? "",
    adjustReason: r.adjustReason ?? "",
    amount: finalAmount(r),
    vat: withVat(finalAmount(r)),
    status: INVOICE_STATUS_LABEL[r.status],
    taxDoc: r.taxDoc ? r.taxDoc.fileName : "미업로드",
    issuedOn: r.issuedOn ? formatDate(r.issuedOn) : "",
    paidOn: r.paidOn ? formatDate(r.paidOn) : "",
    memo: r.memo ?? "",
  }));
  const columns: Column[] = [
    { header: "고객사", key: "customer", width: 24 },
    { header: "청구월", key: "month", width: 10 },
    { header: "항목", key: "items", width: 34 },
    { header: "예정 금액", key: "planned", width: 13, money: true },
    { header: "조정 금액", key: "adjusted", width: 13, money: true },
    { header: "조정 사유", key: "adjustReason", width: 18 },
    { header: "청구 금액(공급가)", key: "amount", width: 15, money: true },
    { header: "VAT 포함", key: "vat", width: 13, money: true },
    { header: "상태", key: "status", width: 10 },
    { header: "세금계산서", key: "taxDoc", width: 24 },
    { header: "발행일", key: "issuedOn", width: 12 },
    { header: "입금일", key: "paidOn", width: 12 },
    { header: "메모", key: "memo", width: 24 },
  ];
  return excelResponse(`청구_${month}.xlsx`, "청구", columns, rows);
}
