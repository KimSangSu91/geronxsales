import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerForm } from "./customer-form";

export default async function NewCustomerPage() {
  const user = await requireUser();
  // 내부 담당자는 활성 사용자 중 선택 (기본값: 나)
  const owners = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/customers" className="hover:text-foreground">
            고객사
          </Link>{" "}
          › 등록
        </p>
        <h1 className="mt-1 text-xl font-semibold">고객사 등록</h1>
      </div>
      <CustomerForm owners={owners} defaultOwnerId={user.id} />
    </div>
  );
}
