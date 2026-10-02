import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { LEVEL_ORDER } from "@/lib/alert-info";
import { addDays, fromDbDate, kstStartOfDay, toDbDate } from "@/lib/date";
import { CUSTOMER_STATUSES } from "@/lib/labels";
import type { ListParams } from "./list-params";

export const PAGE_SIZE = 20;

// 탭을 제외한 검색·필터 조건 (탭별 건수에도 같은 조건 사용)
function buildWhere(p: ListParams): Prisma.CustomerWhereInput {
  const and: Prisma.CustomerWhereInput[] = [];

  if (p.q) {
    const contains = { contains: p.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { name: contains },
        { code: contains },
        { bizNo: contains },
        { contacts: { some: { OR: [{ name: contains }, { phone: contains }] } } },
      ],
    });
  }
  if (p.region.length) and.push({ region: { in: p.region } });
  if (p.type.length) and.push({ facilityType: { in: p.type } });
  if (p.owner.length) and.push({ ownerId: { in: p.owner } });
  if (p.pay.length) and.push({ paymentMethod: { in: p.pay } });
  if (p.alert.length) and.push({ alerts: { some: { resolvedAt: null, type: { in: p.alert } } } });
  if (p.regFrom) and.push({ createdAt: { gte: kstStartOfDay(p.regFrom) } });
  if (p.regTo) and.push({ createdAt: { lt: kstStartOfDay(addDays(p.regTo, 1)) } });
  if (p.endFrom || p.endTo) {
    and.push({
      contracts: {
        some: {
          state: "CURRENT",
          endDate: {
            ...(p.endFrom && { gte: toDbDate(p.endFrom) }),
            ...(p.endTo && { lte: toDbDate(p.endTo) }),
          },
        },
      },
    });
  }
  return { AND: and };
}

export type CustomerRow = Awaited<ReturnType<typeof getCustomerList>>["rows"][number];

export async function getCustomerList(p: ListParams) {
  const where = buildWhere(p);

  const [grouped, customers] = await Promise.all([
    prisma.customer.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.customer.findMany({
      where: { AND: [where, p.tab ? { status: p.tab } : {}] },
      select: {
        id: true,
        no: true,
        name: true,
        code: true,
        status: true,
        facilityType: true,
        facilityTypeOther: true,
        region: true,
        serviceUrl: true,
        createdAt: true,
        owner: { select: { name: true, isActive: true } },
        // 대표 담당자(여러 명 가능) — 첫 번째만 표시하고 나머지는 "외 N명"
        contacts: {
          where: { isPrimary: true },
          orderBy: { createdAt: "asc" },
          select: { name: true, role: true, phone: true },
        },
        contracts: { where: { state: "CURRENT" }, take: 1, select: { endDate: true } },
        // 알림 (해제 안 된 것, 심각도순 표시)
        alerts: { where: { resolvedAt: null }, select: { type: true, level: true, message: true } },
      },
    }),
  ]);

  // 탭별 건수
  const counts = Object.fromEntries(CUSTOMER_STATUSES.map((s) => [s, 0])) as Record<
    (typeof CUSTOMER_STATUSES)[number],
    number
  >;
  for (const g of grouped) counts[g.status] = g._count._all;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // 등록일은 정렬에만 사용 (화면에 표시하지 않음)
  const createdAt = new Map(customers.map((c) => [c.id, c.createdAt.getTime()]));
  // 계산 컬럼: 계약 종료일
  const rows = customers.map((c) => {
    const contract = c.contracts[0];
    return {
      id: c.id,
      no: c.no,
      name: c.name,
      code: c.code,
      status: c.status,
      facilityType: c.facilityType,
      facilityTypeOther: c.facilityTypeOther,
      region: c.region,
      serviceUrl: c.serviceUrl,
      owner: c.owner,
      primaryContact: c.contacts[0] ?? null,
      primaryCount: c.contacts.length,
      alerts: [...c.alerts].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]),
      endDate: contract ? fromDbDate(contract.endDate) : null,
    };
  });

  // 정렬 (계산 컬럼이 있어 메모리에서 처리 — 고객사 수백 곳 규모 기준)
  const statusOrder = new Map(CUSTOMER_STATUSES.map((s, i) => [s, i]));
  const key = (r: (typeof rows)[number]): string | number | null => {
    switch (p.sort) {
      case "no": return r.no;
      case "name": return r.name;
      case "status": return statusOrder.get(r.status)!;
      case "owner": return r.owner.name;
      case "endDate": return r.endDate;
      case "createdAt": return createdAt.get(r.id)!;
    }
  };
  const sign = p.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return b.no - a.no;
    if (ka === null) return 1; // 값 없음은 항상 뒤로
    if (kb === null) return -1;
    const cmp = typeof ka === "number" ? ka - (kb as number) : ka.localeCompare(kb as string, "ko");
    return cmp * sign;
  });

  const filteredCount = rows.length;
  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const page = Math.min(p.page, pageCount);

  return {
    counts,
    total,
    filteredCount,
    page,
    pageCount,
    rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    allIds: rows.map((r) => r.id), // 엑셀 내보내기용 (필터·정렬 결과 전체)
  };
}

// 필터 선택지: 등록된 지역, 내부 담당자(비활성 포함)
export async function getFilterOptions() {
  const [regions, users] = await Promise.all([
    prisma.customer.findMany({ distinct: ["region"], select: { region: true }, orderBy: { region: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  return { regions: regions.map((r) => r.region), users };
}
