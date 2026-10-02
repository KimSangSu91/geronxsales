import "server-only";
import { customerCostLines, monthlyTotalAt, oneTimeTotal } from "@/lib/billing";
import { fromDbDate, todayKst } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import {
  chargeInputOf,
  contractInputOf,
  extraInputOf,
  optionInputOf,
  type ContractTabData,
  type ContractView,
} from "./contract-shared";

export async function getContractTabData(customerId: string, status: string): Promise<ContractTabData> {
  const [contracts, options, extras, trial, excel] = await Promise.all([
    prisma.contract.findMany({
      where: { customerId },
      orderBy: { startDate: "desc" },
      include: { charges: { orderBy: [{ type: "asc" }, { createdAt: "asc" }] } },
    }),
    prisma.optionProduct.findMany({ where: { customerId }, orderBy: { providedOn: "desc" } }),
    prisma.extraDevice.findMany({ where: { customerId }, orderBy: { providedOn: "desc" } }),
    status === "TRIAL"
      ? prisma.trial.findFirst({ where: { customerId, result: "IN_PROGRESS" }, orderBy: { createdAt: "desc" } })
      : null,
    prisma.history.findFirst({
      where: { customerId, content: { startsWith: "엑셀 계약 정보" } },
      select: { content: true },
    }),
  ]);

  const view = (c: (typeof contracts)[number]): ContractView => ({
    id: c.id,
    version: c.version,
    state: c.state,
    origin: c.origin,
    input: contractInputOf(c),
    charges: c.charges.map((x) => ({ id: x.id, version: x.version, input: chargeInputOf(x) })),
  });
  const current = contracts.find((c) => c.state === "CURRENT");
  // 비용 항목 표: 계약 금액·옵션상품·추가 기기·직접 추가 비용을 한 표로 정리
  const lines = customerCostLines({ contract: current ?? null, charges: current?.charges ?? [], options, extras });
  const thisMonth = todayKst().slice(0, 7);

  return {
    current: current ? view(current) : null,
    past: contracts.filter((c) => c.state !== "CURRENT").map(view),
    options: options.map((o) => ({ id: o.id, version: o.version, input: optionInputOf(o) })),
    extras: extras.map((x) => ({ id: x.id, version: x.version, input: extraInputOf(x) })),
    lines,
    thisMonth,
    monthlyTotal: monthlyTotalAt(lines, thisMonth),
    oneTimeTotal: oneTimeTotal(lines),
    trial: trial
      ? {
          startDate: fromDbDate(trial.startDate),
          endDate: fromDbDate(trial.endDate),
          qtyHub: trial.qtyHub,
          qtyBand: trial.qtyBand,
          qtyCharger: trial.qtyCharger,
          qtyAdapter: trial.qtyAdapter,
        }
      : null,
    excelNote: excel ? excel.content.replace(/^엑셀 계약 정보 \([^)]*\):\s*/, "") : null,
  };
}
