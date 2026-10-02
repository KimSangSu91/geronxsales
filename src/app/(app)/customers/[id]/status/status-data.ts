import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate } from "@/lib/date";
import type { StatusFacts } from "@/lib/status-rules";

// 계약 금액 입력 완료 여부 — 구축형: 수량 있는 장비 단가 + 납부 방법·월(분납은 개월 수) / 구독형: 밴드 수 + 밴드 월 단가
function isPriced(c: {
  contractType: "PURCHASE" | "SUBSCRIPTION";
  qtyHub: number;
  qtyBand: number;
  qtyCharger: number;
  unitPriceHub: number | null;
  unitPriceBand: number | null;
  unitPriceCharger: number | null;
  purchasePayment: "LUMP_SUM" | "INSTALLMENT" | null;
  purchaseBillingMonth: Date | null;
  installmentMonths: number | null;
}): boolean {
  if (c.contractType === "SUBSCRIPTION") return c.qtyBand > 0 && c.unitPriceBand !== null;
  const prices =
    (c.qtyHub === 0 || c.unitPriceHub !== null) &&
    (c.qtyBand === 0 || c.unitPriceBand !== null) &&
    (c.qtyCharger === 0 || c.unitPriceCharger !== null);
  const payment =
    !!c.purchasePayment && !!c.purchaseBillingMonth && (c.purchasePayment === "LUMP_SUM" || !!c.installmentMonths);
  return prices && payment;
}

// 상태 전환 검사용 고객사 정보 모으기 (트랜잭션 안·밖 공용)
export async function getStatusFacts(db: Prisma.TransactionClient, customerId: string): Promise<StatusFacts | null> {
  const c = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      code: true,
      address: true,
      bizName: true,
      bizNo: true,
      bizCeo: true,
      installDate: true,
      serviceUrl: true,
      billingDay: true,
      paymentMethod: true,
      taxInvoice: true,
      taxInvoiceEmail: true,
      contracts: {
        where: { state: "CURRENT" },
        take: 1,
        select: {
          id: true,
          contractUsers: true,
          qtyHub: true,
          qtyBand: true,
          qtyCharger: true,
          contractType: true,
          unitPriceHub: true,
          unitPriceBand: true,
          unitPriceCharger: true,
          purchasePayment: true,
          purchaseBillingMonth: true,
          installmentMonths: true,
        },
      },
      _count: { select: { accounts: { where: { status: "IN_USE" } } } },
    },
  });
  if (!c) return null;

  const contract = c.contracts[0];
  // 필수 서류: 현재 계약에 연결된 계약서 최신본 + 디바이스 인수증 최신본 (데이터모델 3-4)
  const [contractDoc, receiptDoc] = await Promise.all([
    contract
      ? db.document.count({ where: { customerId, slot: "CONTRACT", contractId: contract.id, isLatest: true } })
      : 0,
    db.document.count({ where: { customerId, slot: "DEVICE_RECEIPT", isLatest: true } }),
  ]);

  return {
    code: c.code,
    address: c.address,
    bizName: c.bizName,
    bizNo: c.bizNo,
    bizCeo: c.bizCeo,
    installDate: c.installDate ? fromDbDate(c.installDate) : null,
    serviceUrl: c.serviceUrl,
    billingDay: c.billingDay,
    paymentMethod: c.paymentMethod,
    taxInvoice: c.taxInvoice,
    taxInvoiceEmail: c.taxInvoiceEmail,
    contract: contract
      ? {
          contractUsers: contract.contractUsers,
          qtyTotal: contract.qtyHub + contract.qtyBand + contract.qtyCharger,
          priced: isPriced(contract),
        }
      : null,
    docs: { contract: contractDoc > 0, deviceReceipt: receiptDoc > 0 },
    inUseAccounts: c._count.accounts,
  };
}
