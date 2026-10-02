import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate, toDbDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import type { InvoiceLineView, InvoiceRow } from "./invoice-shared";

// 청구 건 목록 — 고객사별(연도) 또는 월별(전체 고객사)
export async function getInvoices(where: { customerId?: string; year?: number; month?: string }): Promise<InvoiceRow[]> {
  const w: Prisma.InvoiceWhereInput = {};
  if (where.customerId) w.customerId = where.customerId;
  if (where.year) w.billingMonth = { gte: toDbDate(`${where.year}-01-01`), lte: toDbDate(`${where.year}-12-01`) };
  if (where.month) w.billingMonth = toDbDate(`${where.month}-01`);
  const rows = await prisma.invoice.findMany({
    where: w,
    orderBy: [{ billingMonth: "desc" }, { customer: { name: "asc" } }],
    include: {
      customer: { select: { name: true } },
      documents: { select: { id: true, fileName: true }, take: 1 },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    customerId: r.customerId,
    customerName: r.customer.name,
    month: fromDbDate(r.billingMonth).slice(0, 7),
    planned: r.plannedAmount,
    adjusted: r.adjustedAmount,
    adjustReason: r.adjustReason,
    lines: (Array.isArray(r.lineItems) ? r.lineItems : []) as unknown as InvoiceLineView[],
    status: r.status,
    issuedOn: r.issuedOn ? fromDbDate(r.issuedOn) : null,
    paidOn: r.paidOn ? fromDbDate(r.paidOn) : null,
    method: r.method,
    memo: r.memo,
    taxDoc: r.documents[0] ?? null,
  }));
}
