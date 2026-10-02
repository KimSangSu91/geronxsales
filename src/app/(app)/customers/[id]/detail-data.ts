import "server-only";
import { monthlyTotal } from "@/lib/billing";
import { fromDbDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export async function getCustomerDetail(id: string) {
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, isActive: true } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
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
  };
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomerDetail>>>;
