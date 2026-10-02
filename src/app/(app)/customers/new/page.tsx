import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { emptyContact, type CustomerInput } from "@/lib/customer-input";
import { prisma } from "@/lib/prisma";
import { CustomerForm } from "./customer-form";

export default async function NewCustomerPage({ searchParams }: PageProps<"/customers/new">) {
  const user = await requireUser();
  const sp = await searchParams;
  // 내부 담당자는 활성 사용자 중 선택 (기본값: 나 / 문의 전환이면 수신 경로의 기본 담당자)
  const owners = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // 인바운드 문의에서 전환 (?inquiry=)
  const inquiryId = typeof sp.inquiry === "string" ? sp.inquiry : undefined;
  let preset: Partial<CustomerInput> | undefined;
  let defaultOwnerId = user.id;
  if (inquiryId) {
    const q = await prisma.inquiry.findUnique({ where: { id: inquiryId }, include: { source: true } });
    if (!q || q.status !== "NEW") redirect("/inbound");
    if (q.source?.defaultOwnerId && owners.some((o) => o.id === q.source!.defaultOwnerId)) defaultOwnerId = q.source.defaultOwnerId;
    const capacity = q.scale?.match(/\d+/)?.[0] ?? "";
    preset = {
      name: q.facilityName ?? "",
      region: q.region ?? "",
      capacity,
      ownerId: defaultOwnerId,
      inboundChannel: q.channel,
      referrer: q.source?.name ?? "",
      memo: [q.scale && `규모: ${q.scale}`, q.content].filter(Boolean).join("\n"),
      contacts: [{ ...emptyContact(true), name: q.contactName ?? "", phone: q.phone ?? "", email: q.email ?? "" }],
    };
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={inquiryId ? "/inbound" : "/customers"} className="hover:text-foreground">
            {inquiryId ? "인바운드 문의함" : "고객사"}
          </Link>{" "}
          › {inquiryId ? "고객사로 전환" : "등록"}
        </p>
        <h1 className="mt-1 text-xl font-semibold">{inquiryId ? "문의를 고객사로 전환" : "고객사 등록"}</h1>
      </div>
      <CustomerForm owners={owners} defaultOwnerId={defaultOwnerId} preset={preset} inquiryId={inquiryId} />
    </div>
  );
}
