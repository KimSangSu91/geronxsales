-- 고객사 상태에서 문의접수(INQUIRY) 제거 → 등록·문의 전환 시 진행대기(PENDING)로 시작
-- 문의접수 단계는 인바운드 문의함(Inquiry)에서 관리

-- 기존 문의접수 고객사는 진행대기로 이동
UPDATE "Customer" SET "status" = 'PENDING' WHERE "status" = 'INQUIRY';

-- AlterEnum
CREATE TYPE "CustomerStatus_new" AS ENUM ('PENDING', 'ONBOARDING', 'TRIAL', 'ACTIVE', 'ENDED', 'TERMINATED', 'NOT_CONVERTED', 'OTHER');
ALTER TABLE "Customer" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Customer" ALTER COLUMN "status" TYPE "CustomerStatus_new" USING ("status"::text::"CustomerStatus_new");
ALTER TYPE "CustomerStatus" RENAME TO "CustomerStatus_old";
ALTER TYPE "CustomerStatus_new" RENAME TO "CustomerStatus";
DROP TYPE "CustomerStatus_old";
ALTER TABLE "Customer" ALTER COLUMN "status" SET DEFAULT 'PENDING';
