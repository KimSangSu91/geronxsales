import "server-only";
import { addMonthsYm, contractPricingOf, customerCostLines, installmentAmount, purchaseTotal, type CostLine } from "@/lib/billing";
import { todayKst, toDbDate } from "@/lib/date";
import { recordHistory } from "@/lib/history";
import { formatWon } from "@/lib/money";
import { prisma } from "@/lib/prisma";

// 청구 건 내역 1줄 (생성 시점 스냅샷 — Invoice.lineItems)
export type InvoiceLine = {
  source: CostLine["source"];
  name: string;
  detail: string;
  type: "ONE_TIME" | "MONTHLY";
  amount: number; // 공급가
};

const ymText = (m: string) => m.replace("-", ".");

// 고객사의 해당 월 청구 내역 = 그 달에 걸리는 월 비용 + 청구월이 그 달인 일시 비용 (무상 제외, 기능정의서 4-6)
export async function monthLines(customerId: string, month: string): Promise<InvoiceLine[]> {
  const [contract, options, extras] = await Promise.all([
    prisma.contract.findFirst({ where: { customerId, state: "CURRENT" }, include: { charges: true } }),
    prisma.optionProduct.findMany({ where: { customerId } }),
    prisma.extraDevice.findMany({ where: { customerId } }),
  ]);
  const lines = customerCostLines({ contract, charges: contract?.charges ?? [], options, extras });
  const result: InvoiceLine[] = [];
  for (const l of lines) {
    if (l.isFree) continue;
    if (l.type === "ONE_TIME") {
      if (l.billingMonth === month) result.push({ source: l.source, name: l.label, detail: l.detail, type: "ONE_TIME", amount: l.amount });
      continue;
    }
    if ((l.fromMonth && month < l.fromMonth) || (l.toMonth && month > l.toMonth)) continue;
    let amount = l.amount;
    // 분납: 원 단위 내림으로 남는 금액은 마지막 회차에 포함
    if (l.key === "contract-installment" && contract && l.toMonth === month) {
      const p = contractPricingOf(contract);
      const total = purchaseTotal(p);
      amount = total - installmentAmount(total, p.installmentMonths!) * (p.installmentMonths! - 1);
    }
    result.push({ source: l.source, name: l.label, detail: l.detail, type: "MONTHLY", amount });
  }
  return result.filter((l) => l.amount > 0);
}

export const sumLines = (lines: InvoiceLine[]) => lines.reduce((s, l) => s + l.amount, 0);

// 청구 건 만들기 — 대상: 사용중 고객사, 이미 있으면 건너뜀, 금액 0원이면 만들지 않음
// 매일 배치에서 호출 (매월 1일 대신 매일 확인 — 데이터모델 4장)
export async function ensureMonthlyInvoices(month = todayKst().slice(0, 7)) {
  const customers = await prisma.customer.findMany({
    where: { status: "ACTIVE", invoices: { none: { billingMonth: toDbDate(`${month}-01`) } } },
    select: { id: true, name: true },
  });
  const created: string[] = [];
  for (const c of customers) {
    const lines = await monthLines(c.id, month);
    const total = sumLines(lines);
    if (total <= 0) continue;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.invoice.create({
          data: { customerId: c.id, billingMonth: toDbDate(`${month}-01`), plannedAmount: total, lineItems: lines },
        });
        await recordHistory(tx, {
          customerId: c.id,
          event: "invoice_created",
          content: `${ymText(month)} 청구 건 생성: 예정 ${formatWon(total)}원 (${lines.map((l) => l.name).join(" · ")})`,
          actorId: null,
        });
      });
      created.push(c.name);
    } catch (e) {
      // 동시에 다른 실행이 먼저 만든 경우(고객사·월 유니크) — 건너뜀
      if (!(e instanceof Error && "code" in e && (e as { code: string }).code === "P2002")) throw e;
    }
  }
  return created;
}

// 화면을 열 때 호출 — 매일 배치와 별도로 이번 달 청구 건을 자동으로 맞춤 (1분 안에 이미 맞췄으면 건너뜀)
// 진행 중인 실행이 있으면 그 결과를 같이 기다림 → 레이아웃·페이지가 동시에 불러도 한 번만 실행
let lastEnsure = 0;
let ensuring: Promise<unknown> | null = null;
export function ensureMonthlyInvoicesIfStale() {
  if (ensuring) return ensuring;
  if (Date.now() - lastEnsure < 60_000) return Promise.resolve();
  lastEnsure = Date.now();
  ensuring = ensureMonthlyInvoices()
    .catch((e) => console.error("청구 건 자동 생성 실패", e))
    .finally(() => {
      ensuring = null;
    });
  return ensuring;
}

export const nextMonth = (month: string) => addMonthsYm(month, 1);
