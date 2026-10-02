// 청구 건 화면·서버 공용 타입 (브라우저에서도 import 가능)
import type { InvoiceStatus, ProcessMethod } from "@/generated/prisma/enums";

export type InvoiceLineView = {
  source: "CONTRACT" | "OPTION" | "EXTRA" | "MANUAL";
  name: string;
  detail: string;
  type: "ONE_TIME" | "MONTHLY";
  amount: number;
};

export type InvoiceRow = {
  id: string;
  version: number;
  customerId: string;
  customerName: string;
  month: string; // 'YYYY-MM'
  planned: number; // 생성 시점 예정 금액
  adjusted: number | null; // 조정 금액
  adjustReason: string | null;
  lines: InvoiceLineView[];
  status: InvoiceStatus;
  issuedOn: string | null;
  paidOn: string | null;
  method: ProcessMethod;
  memo: string | null;
  taxDoc: { id: string; fileName: string } | null;
};

export const finalAmount = (r: { planned: number; adjusted: number | null }) => r.adjusted ?? r.planned;

// 합계: 예정 / 청구 완료(청구 완료·입금 확인·미납 = 청구한 건) / 입금 확인 / 미납
export function invoiceTotals(rows: InvoiceRow[]) {
  const sum = (f: (r: InvoiceRow) => boolean) => rows.filter(f).reduce((s, r) => s + finalAmount(r), 0);
  const count = (f: (r: InvoiceRow) => boolean) => rows.filter(f).length;
  return {
    planned: sum(() => true),
    billed: sum((r) => r.status !== "BEFORE"),
    paid: sum((r) => r.status === "PAID"),
    unpaid: sum((r) => r.status === "UNPAID"),
    byStatus: {
      BEFORE: { count: count((r) => r.status === "BEFORE"), amount: sum((r) => r.status === "BEFORE") },
      BILLED: { count: count((r) => r.status === "BILLED"), amount: sum((r) => r.status === "BILLED") },
      PAID: { count: count((r) => r.status === "PAID"), amount: sum((r) => r.status === "PAID") },
      UNPAID: { count: count((r) => r.status === "UNPAID"), amount: sum((r) => r.status === "UNPAID") },
    },
  };
}
