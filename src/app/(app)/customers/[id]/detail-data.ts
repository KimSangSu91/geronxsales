import "server-only";
import { customerCostLines, monthlyTotalAt } from "@/lib/billing";
import { fromDbDate, todayKst } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export async function getCustomerDetail(id: string) {
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, isActive: true } },
      contacts: { orderBy: { createdAt: "asc" } },
      accounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      contracts: { where: { state: "CURRENT" }, take: 1, include: { charges: true } },
      options: true,
      // 진행 중인 체험 (체험 종료 배지)
      trials: { where: { result: "IN_PROGRESS" }, orderBy: { createdAt: "desc" }, take: 1 },
      // 진행 중인 회수·종료 체크리스트 (배너·기본 탭 판단)
      closures: { where: { completedAt: null }, select: { entries: { select: { done: true } } } },
      histories: {
        where: { kind: "MANUAL" },
        orderBy: { occurredOn: "desc" },
        take: 1,
        select: { occurredOn: true },
      },
    },
  });
  if (!c) return null;

  const contract = c.contracts[0];
  return {
    customer: c,
    contract: contract ? { endDate: fromDbDate(contract.endDate), contractUsers: contract.contractUsers } : null,
    // 이번 달 청구 기준 월 비용
    monthly: monthlyTotalAt(
      customerCostLines({ contract: contract ?? null, charges: contract?.charges ?? [], options: c.options, extras: [] }),
      todayKst().slice(0, 7),
    ),
    lastActivity: c.histories[0] ? fromDbDate(c.histories[0].occurredOn) : null,
    trial: c.trials[0] ? { id: c.trials[0].id, startDate: fromDbDate(c.trials[0].startDate), endDate: fromDbDate(c.trials[0].endDate) } : null,
    renewalFacts: contract
      ? {
          endDate: fromDbDate(contract.endDate),
          renewalCancelled: contract.renewalCancelled,
          autoRenewPending: !!contract.autoRenewedFrom,
        }
      : null,
    openClosure: c.closures.length
      ? {
          done: c.closures.flatMap((x) => x.entries).filter((e) => e.done).length,
          total: c.closures.flatMap((x) => x.entries).length,
        }
      : null,
  };
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomerDetail>>>;
