-- 갱신 = 종료일 연장 방식: 자동연장 전 종료일 보관
-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "autoRenewedFrom" DATE;

