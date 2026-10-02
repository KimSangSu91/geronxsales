import "server-only";
import { formatDateTimeKst } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import type { DocumentsTabData, DocView } from "./documents-shared";

export async function getDocumentsData(customerId: string, status: string): Promise<DocumentsTabData> {
  const [docs, current] = await Promise.all([
    prisma.document.findMany({
      where: { customerId, slot: { not: "TAX_INVOICE" } },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { name: true } } },
    }),
    prisma.contract.findFirst({ where: { customerId, state: "CURRENT" }, select: { id: true } }),
  ]);

  const view = (d: (typeof docs)[number]): DocView => ({
    id: d.id,
    slot: d.slot as DocView["slot"],
    etcCategory: d.etcCategory,
    fileName: d.fileName,
    mimeType: d.mimeType,
    size: d.size,
    uploadedBy: d.uploadedBy.name,
    uploadedAt: formatDateTimeKst(d.createdAt),
  });

  // 계약서는 현재 계약에 연결된 것만 (이전 계약 계약서는 계약·비용 탭 이전 계약에서)
  const contractDoc = current ? docs.find((d) => d.slot === "CONTRACT" && d.contractId === current.id) : undefined;
  const bySlot = (slot: string) => docs.filter((d) => d.slot === slot).map(view);

  return {
    hasContract: !!current,
    status,
    contract: contractDoc ? view(contractDoc) : null,
    deviceReceipt: bySlot("DEVICE_RECEIPT")[0] ?? null,
    bizRegistration: bySlot("BIZ_REGISTRATION")[0] ?? null,
    bankbook: bySlot("BANKBOOK")[0] ?? null,
    residentList: bySlot("RESIDENT_LIST")[0] ?? null,
    drawings: bySlot("DRAWING"),
    etc: bySlot("ETC"),
  };
}
