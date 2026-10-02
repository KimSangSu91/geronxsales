-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "dismissReason" TEXT,
ADD COLUMN     "scale" TEXT,
ADD COLUMN     "sourceId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InboundSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "defaultOwnerId" UUID,
    "lastReceivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundSource_token_key" ON "InboundSource"("token");

-- AddForeignKey
ALTER TABLE "InboundSource" ADD CONSTRAINT "InboundSource_defaultOwnerId_fkey" FOREIGN KEY ("defaultOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "InboundSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS: 정책 없이 켬 (DB 접근은 서버 Prisma로만)
ALTER TABLE "InboundSource" ENABLE ROW LEVEL SECURITY;
