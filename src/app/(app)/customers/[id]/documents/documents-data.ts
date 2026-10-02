import "server-only";
import { formatDateTimeKst } from "@/lib/date";
import { FIXED_SLOTS } from "@/lib/document-rules";
import { prisma } from "@/lib/prisma";
import type { DocumentsTabData, DocView } from "./documents-shared";

export async function getDocumentsData(customerId: string): Promise<DocumentsTabData> {
  const [docs, current] = await Promise.all([
    prisma.document.findMany({
      where: { customerId, slot: { not: "TAX_INVOICE" } },
      orderBy: { createdAt: "asc" },
      include: { uploadedBy: { select: { name: true } } },
    }),
    prisma.contract.findFirst({ where: { customerId, state: "CURRENT" }, select: { id: true } }),
  ]);

  const view = (d: (typeof docs)[number]): DocView => ({
    id: d.id,
    slot: d.slot as DocView["slot"],
    title: d.title,
    fileName: d.fileName,
    mimeType: d.mimeType,
    size: d.size,
    uploadedBy: d.uploadedBy.name,
    uploadedAt: formatDateTimeKst(d.createdAt),
  });

  const fixed: DocumentsTabData["fixed"] = {};
  for (const slot of FIXED_SLOTS) {
    // 계약서는 현재 계약에 연결된 것만 (이전 계약 계약서는 계약·비용 탭 이전 계약에서)
    const doc = docs.find((d) => d.slot === slot && (slot !== "CONTRACT" || (current && d.contractId === current.id)));
    if (doc) fixed[slot] = view(doc);
  }

  return {
    hasContract: !!current,
    fixed,
    extra: docs.filter((d) => d.slot === "ETC").map(view),
  };
}
