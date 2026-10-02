import "server-only";
import { monthlyTotal } from "@/lib/billing";
import { fromDbDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export async function getCustomerDetail(id: string) {
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, isActive: true } },
      contacts: { orderBy: { createdAt: "asc" } },
      accounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      contracts: {
        where: { state: "CURRENT" },
        take: 1,
        select: {
          endDate: true,
          contractUsers: true,
          charges: { where: { type: "MONTHLY", isFree: false }, select: { amount: true } },
        },
      },
      options: { where: { chargeType: "MONTHLY", isFree: false }, select: { amount: true } },
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
    monthly: monthlyTotal(contract?.charges ?? [], c.options),
    lastActivity: c.histories[0] ? fromDbDate(c.histories[0].occurredOn) : null,
    openClosure: c.closures.length
      ? {
          done: c.closures.flatMap((x) => x.entries).filter((e) => e.done).length,
          total: c.closures.flatMap((x) => x.entries).length,
        }
      : null,
  };
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomerDetail>>>;
