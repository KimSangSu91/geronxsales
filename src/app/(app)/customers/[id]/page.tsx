import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerStatusBadge } from "@/components/customer-status-badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 임시 상세 화면 — 다음 작업(고객사 상세)에서 교체
export default async function CustomerDetailPage({ params }: PageProps<"/customers/[id]">) {
  await requireUser();
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { name: true, code: true, status: true, _count: { select: { contacts: true, checklist: true } } },
  });
  if (!customer) notFound();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <Link href="/customers" className="hover:text-foreground">
          고객사
        </Link>{" "}
        › {customer.name}
      </p>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{customer.name}</h1>
        {customer.code && <span className="text-muted-foreground">{customer.code}</span>}
        <CustomerStatusBadge status={customer.status} />
      </div>
      <div className="flex h-60 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground">
        <p>상세 화면은 다음 작업에서 구현합니다</p>
        <p>
          시설 담당자 {customer._count.contacts}명 · 체크리스트 {customer._count.checklist}개
        </p>
      </div>
    </div>
  );
}
