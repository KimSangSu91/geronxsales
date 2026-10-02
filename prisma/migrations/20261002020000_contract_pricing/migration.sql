-- 계약 금액 구조 변경: 구축형/구독형·단가·납부·관리비·자동연장 기간 추가, 선불/후불·계약 어댑터 수량 제거

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PURCHASE', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PurchasePayment" AS ENUM ('LUMP_SUM', 'INSTALLMENT');

-- AlterTable
ALTER TABLE "Contract" DROP COLUMN "billingTiming",
DROP COLUMN "qtyAdapter",
ADD COLUMN     "autoRenewMonths" INTEGER,
ADD COLUMN     "contractType" "ContractType" NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN     "installmentMonths" INTEGER,
ADD COLUMN     "managementFee" INTEGER,
ADD COLUMN     "managementFeeStart" DATE,
ADD COLUMN     "purchaseBillingMonth" DATE,
ADD COLUMN     "purchasePayment" "PurchasePayment",
ADD COLUMN     "unitPriceBand" INTEGER,
ADD COLUMN     "unitPriceCharger" INTEGER,
ADD COLUMN     "unitPriceHub" INTEGER;

-- DropEnum
DROP TYPE "BillingTiming";


-- 기존 자동연장 계약은 1년 연장으로
UPDATE "Contract" SET "autoRenewMonths" = 12 WHERE "autoRenew" = true AND "autoRenewMonths" IS NULL;
