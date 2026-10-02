"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import {
  CODE_RE,
  normalizeBizNo,
  normalizePhone,
  validateCustomerInput,
  type CustomerInput,
  type FieldErrors,
} from "@/lib/customer-input";
import { recordHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";

// 고객사 코드 사용 가능 여부 (입력 즉시 중복 확인)
export async function checkCodeAvailable(code: string): Promise<boolean> {
  await requireUser();
  const c = code.trim();
  if (!CODE_RE.test(c)) return false;
  return !(await prisma.customer.findUnique({ where: { code: c }, select: { id: true } }));
}

export type CreateCustomerResult = { errors: FieldErrors; message?: string };

const text = (v: string) => v.trim() || null;
const int = (v: string) => (v.trim() ? Number(v) : null);

export async function createCustomer(input: CustomerInput): Promise<CreateCustomerResult> {
  const user = await requireUser();

  const errors = validateCustomerInput(input);
  if (Object.keys(errors).length) return { errors, message: "입력 내용을 확인하세요." };

  const code = text(input.code);
  if (code && !(await checkCodeAvailable(code))) {
    return { errors: { code: "이미 사용 중인 코드입니다." }, message: "입력 내용을 확인하세요." };
  }

  const owner = await prisma.user.findUnique({ where: { id: input.ownerId } });
  if (!owner?.isActive) return { errors: { ownerId: "활성 사용자를 선택하세요." }, message: "입력 내용을 확인하세요." };

  // 내용이 있는 담당자만 저장, 대표는 1명(선택 없으면 첫 번째)
  const contacts = input.contacts.filter((c) => c.name.trim());
  const primaryIndex = Math.max(0, contacts.findIndex((c) => c.isPrimary));

  let customerId: string;
  try {
    customerId = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: input.name.trim(),
          code,
          status: "INQUIRY",
          facilityType: input.facilityType || "OTHER",
          facilityTypeOther: input.facilityType === "OTHER" ? text(input.facilityTypeOther) : null,
          region: input.region.trim(),
          address: text(input.address),
          capacity: int(input.capacity),
          ownerId: owner.id,
          inboundChannel: input.inboundChannel || null,
          referrer: input.inboundChannel === "REFERRAL" ? text(input.referrer) : null,
          memo: text(input.memo),
          bizName: text(input.bizName),
          bizNo: input.bizNo.trim() ? normalizeBizNo(input.bizNo) : null,
          bizCeo: text(input.bizCeo),
          billingDay: int(input.billingDay),
          paymentMethod: input.paymentMethod || null,
          taxInvoice: input.taxInvoice === "" ? null : input.taxInvoice === "yes",
          taxInvoiceEmail: text(input.taxInvoiceEmail),
          floors: int(input.floors),
          rooms: int(input.rooms),
          wifiSsid: text(input.wifiSsid),
          wifiPasswordEnc: input.wifiPassword ? encrypt(input.wifiPassword) : null,
          networkMemo: text(input.networkMemo),
          serviceUrl: text(input.serviceUrl),
          contacts: {
            create: contacts.map((c, i) => ({
              name: c.name.trim(),
              phone: c.phone.trim() ? normalizePhone(c.phone) : null,
              role: c.role || null,
              title: text(c.title),
              email: text(c.email),
              memo: text(c.memo),
              isPrimary: i === primaryIndex,
            })),
          },
        },
      });

      // 도입 체크리스트: 활성 ONBOARDING 항목만큼 미완료로 생성 (데이터모델 3-3)
      const items = await tx.checklistItem.findMany({
        where: { kind: "ONBOARDING", isActive: true },
        select: { id: true },
      });
      await tx.checklistEntry.createMany({
        data: items.map((item) => ({ customerId: customer.id, itemId: item.id })),
      });

      await recordHistory(tx, {
        customerId: customer.id,
        event: "customer_created",
        content: "고객사 등록 (문의접수)",
        actorId: user.id,
      });

      return customer.id;
    });
  } catch (e) {
    // 동시에 같은 코드로 저장한 경우
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { errors: { code: "이미 사용 중인 코드입니다." }, message: "입력 내용을 확인하세요." };
    }
    throw e;
  }

  revalidatePath("/customers");
  redirect(`/customers/${customerId}`);
}
