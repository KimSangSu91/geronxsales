-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('INQUIRY', 'PENDING', 'ONBOARDING', 'TRIAL', 'ACTIVE', 'ENDED', 'TERMINATED', 'NOT_CONVERTED', 'OTHER');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('NURSING_HOME', 'GROUP_HOME', 'DAY_CARE', 'HOME_CARE', 'OTHER');

-- CreateEnum
CREATE TYPE "InboundChannel" AS ENUM ('GOOGLE_FORM', 'EMAIL', 'PHONE', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('DIRECTOR', 'NURSING', 'ADMIN_BILLING', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CMS', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ADMIN', 'NURSE', 'CAREGIVER', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('IN_USE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BillingTiming" AS ENUM ('PREPAID', 'POSTPAID');

-- CreateEnum
CREATE TYPE "ContractOrigin" AS ENUM ('NEW', 'RENEWAL', 'AUTO_RENEWAL', 'MIGRATION');

-- CreateEnum
CREATE TYPE "ContractState" AS ENUM ('CURRENT', 'PAST', 'VOID');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('ONE_TIME', 'MONTHLY');

-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('BAND', 'HUB', 'CHARGER', 'ADAPTER', 'OTHER');

-- CreateEnum
CREATE TYPE "OptionCategory" AS ENUM ('TABLET', 'TV', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtraDeviceReason" AS ENUM ('LOST', 'BROKEN', 'EXPANSION', 'OTHER');

-- CreateEnum
CREATE TYPE "TrialResult" AS ENUM ('IN_PROGRESS', 'CONVERTED', 'NOT_CONVERTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('BEFORE', 'BILLED', 'PAID', 'UNPAID');

-- CreateEnum
CREATE TYPE "ProcessMethod" AS ENUM ('MANUAL', 'CMS');

-- CreateEnum
CREATE TYPE "ChecklistKind" AS ENUM ('ONBOARDING', 'CLOSING');

-- CreateEnum
CREATE TYPE "ClosureType" AS ENUM ('NOT_CONVERTED', 'ENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "DocumentSlot" AS ENUM ('CONTRACT', 'DEVICE_RECEIPT', 'BIZ_REGISTRATION', 'BANKBOOK', 'DRAWING', 'RESIDENT_LIST', 'TAX_INVOICE', 'ETC');

-- CreateEnum
CREATE TYPE "EtcCategory" AS ENUM ('INSTALL_PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "HistoryKind" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('MEETING', 'CALL', 'EMAIL', 'VISIT', 'OTHER');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'CONVERTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('RENEWAL_CHECK', 'RENEWAL_CANCELLED', 'AUTO_RENEWED_UNCONFIRMED', 'PENDING_STALE', 'TRIAL_ENDING', 'ONBOARDING_DELAYED', 'RECOVERY_INCOMPLETE', 'INQUIRY_UNHANDLED', 'INVOICE_UNBILLED', 'INVOICE_UNPAID', 'OWNER_INACTIVE');

-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('WARNING', 'DANGER', 'INFO');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "alertsSeenAt" TIMESTAMP(3),
    "historyPanelCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginLog" (
    "id" TEXT NOT NULL,
    "userId" UUID,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "no" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'INQUIRY',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedOn" DATE,
    "facilityType" "FacilityType" NOT NULL,
    "facilityTypeOther" TEXT,
    "region" TEXT NOT NULL,
    "address" TEXT,
    "capacity" INTEGER,
    "ownerId" UUID NOT NULL,
    "inboundChannel" "InboundChannel",
    "referrer" TEXT,
    "memo" TEXT,
    "bizName" TEXT,
    "bizNo" TEXT,
    "bizCeo" TEXT,
    "billingDay" INTEGER,
    "paymentMethod" "PaymentMethod",
    "taxInvoice" BOOLEAN,
    "taxInvoiceEmail" TEXT,
    "cmsMemberNo" TEXT,
    "cmsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "floors" INTEGER,
    "rooms" INTEGER,
    "wifiSsid" TEXT,
    "wifiPasswordEnc" TEXT,
    "networkMemo" TEXT,
    "serviceUrl" TEXT,
    "meetingDate" DATE,
    "installDate" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "ContactRole",
    "title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "memo" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "typeOther" TEXT,
    "userName" TEXT,
    "issuedOn" DATE,
    "status" "AccountStatus" NOT NULL DEFAULT 'IN_USE',
    "deactivatedOn" DATE,
    "passwordEnc" TEXT,
    "memo" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "state" "ContractState" NOT NULL DEFAULT 'CURRENT',
    "origin" "ContractOrigin" NOT NULL DEFAULT 'NEW',
    "previousId" TEXT,
    "contractDate" DATE NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "contractUsers" INTEGER NOT NULL,
    "billingTiming" "BillingTiming" NOT NULL DEFAULT 'POSTPAID',
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "qtyHub" INTEGER NOT NULL DEFAULT 0,
    "qtyBand" INTEGER NOT NULL DEFAULT 0,
    "qtyCharger" INTEGER NOT NULL DEFAULT 0,
    "qtyAdapter" INTEGER NOT NULL DEFAULT 0,
    "renewalCancelled" BOOLEAN NOT NULL DEFAULT false,
    "renewalCancelReason" TEXT,
    "autoRenewConfirmedAt" TIMESTAMP(3),
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractCharge" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "ChargeType" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "freeReason" TEXT,
    "billingMonth" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trial" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "qtyHub" INTEGER NOT NULL DEFAULT 0,
    "qtyBand" INTEGER NOT NULL DEFAULT 0,
    "qtyCharger" INTEGER NOT NULL DEFAULT 0,
    "qtyAdapter" INTEGER NOT NULL DEFAULT 0,
    "result" "TrialResult" NOT NULL DEFAULT 'IN_PROGRESS',
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionProduct" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "category" "OptionCategory" NOT NULL,
    "categoryOther" TEXT,
    "productName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "providedOn" DATE NOT NULL,
    "chargeType" "ChargeType" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "freeReason" TEXT,
    "billingMonth" DATE,
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraDevice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL,
    "kindOther" TEXT,
    "qty" INTEGER NOT NULL,
    "reason" "ExtraDeviceReason" NOT NULL,
    "reasonOther" TEXT,
    "providedOn" DATE NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "freeReason" TEXT,
    "billingMonth" DATE,
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtraDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "billingMonth" DATE NOT NULL,
    "plannedAmount" INTEGER NOT NULL,
    "lineItems" JSONB NOT NULL,
    "adjustedAmount" INTEGER,
    "adjustReason" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'BEFORE',
    "issuedOn" DATE,
    "paidOn" DATE,
    "method" "ProcessMethod" NOT NULL DEFAULT 'MANUAL',
    "cmsRef" TEXT,
    "cmsResult" JSONB,
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "kind" "ChecklistKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "closureId" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "ClosureType" NOT NULL,
    "recoveredOn" DATE,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Closure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryLine" (
    "id" TEXT NOT NULL,
    "closureId" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL,
    "label" TEXT,
    "providedQty" INTEGER NOT NULL,
    "recoveredQty" INTEGER NOT NULL DEFAULT 0,
    "missingReason" TEXT,

    CONSTRAINT "RecoveryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "slot" "DocumentSlot" NOT NULL,
    "etcCategory" "EtcCategory",
    "contractId" TEXT,
    "invoiceId" TEXT,
    "groupId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "History" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "HistoryKind" NOT NULL,
    "event" TEXT NOT NULL,
    "activityType" "ActivityType",
    "occurredOn" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "data" JSONB,
    "actorId" UUID,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "History_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "channel" "InboundChannel" NOT NULL,
    "externalId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "facilityName" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "region" TEXT,
    "content" TEXT,
    "raw" JSONB,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "customerId" TEXT,
    "handledById" UUID,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "level" "AlertLevel" NOT NULL,
    "customerId" TEXT,
    "refId" TEXT,
    "message" TEXT NOT NULL,
    "dueDate" DATE,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LoginLog_userId_createdAt_idx" ON "LoginLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_no_key" ON "Customer"("no");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_ownerId_idx" ON "Customer"("ownerId");

-- CreateIndex
CREATE INDEX "FacilityContact_customerId_idx" ON "FacilityContact"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAccount_loginId_key" ON "ServiceAccount"("loginId");

-- CreateIndex
CREATE INDEX "ServiceAccount_customerId_idx" ON "ServiceAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_previousId_key" ON "Contract"("previousId");

-- CreateIndex
CREATE INDEX "Contract_customerId_state_idx" ON "Contract"("customerId", "state");

-- CreateIndex
CREATE INDEX "Contract_endDate_idx" ON "Contract"("endDate");

-- CreateIndex
CREATE INDEX "ContractCharge_contractId_idx" ON "ContractCharge"("contractId");

-- CreateIndex
CREATE INDEX "Trial_customerId_idx" ON "Trial"("customerId");

-- CreateIndex
CREATE INDEX "OptionProduct_customerId_idx" ON "OptionProduct"("customerId");

-- CreateIndex
CREATE INDEX "ExtraDevice_customerId_idx" ON "ExtraDevice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_billingMonth_status_idx" ON "Invoice"("billingMonth", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_customerId_billingMonth_key" ON "Invoice"("customerId", "billingMonth");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_code_key" ON "ChecklistItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistEntry_customerId_itemId_closureId_key" ON "ChecklistEntry"("customerId", "itemId", "closureId");

-- CreateIndex
CREATE INDEX "Closure_customerId_idx" ON "Closure"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storagePath_key" ON "Document"("storagePath");

-- CreateIndex
CREATE INDEX "Document_customerId_slot_isLatest_idx" ON "Document"("customerId", "slot", "isLatest");

-- CreateIndex
CREATE INDEX "Document_groupId_idx" ON "Document"("groupId");

-- CreateIndex
CREATE INDEX "History_customerId_createdAt_idx" ON "History"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Inquiry_externalId_key" ON "Inquiry"("externalId");

-- CreateIndex
CREATE INDEX "Inquiry_status_receivedAt_idx" ON "Inquiry"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- CreateIndex
CREATE INDEX "Alert_resolvedAt_createdAt_idx" ON "Alert"("resolvedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "LoginLog" ADD CONSTRAINT "LoginLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityContact" ADD CONSTRAINT "FacilityContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAccount" ADD CONSTRAINT "ServiceAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractCharge" ADD CONSTRAINT "ContractCharge_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionProduct" ADD CONSTRAINT "OptionProduct_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraDevice" ADD CONSTRAINT "ExtraDevice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistEntry" ADD CONSTRAINT "ChecklistEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistEntry" ADD CONSTRAINT "ChecklistEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistEntry" ADD CONSTRAINT "ChecklistEntry_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "Closure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistEntry" ADD CONSTRAINT "ChecklistEntry_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closure" ADD CONSTRAINT "Closure_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryLine" ADD CONSTRAINT "RecoveryLine_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "Closure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "History" ADD CONSTRAINT "History_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "History" ADD CONSTRAINT "History_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── 수동 추가 (docs/데이터모델.md 3-3, CLAUDE.md RLS 규칙) ─────────

-- 도입 체크리스트(closureId 없음)는 고객사·항목당 1건만
CREATE UNIQUE INDEX "ChecklistEntry_onboarding_unique" ON "ChecklistEntry"("customerId", "itemId") WHERE "closureId" IS NULL;

-- public 테이블은 RLS를 켜고 정책을 두지 않음 → Supabase API(anon/authenticated)로는 접근 불가, 서버 Prisma만 접근
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoginLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FacilityContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractCharge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptionProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExtraDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChecklistEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Closure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecoveryLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "History" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
