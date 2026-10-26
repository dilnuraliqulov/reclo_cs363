-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'READ', 'RESPONDED', 'CLOSED');

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "message" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "desiredStartDate" TIMESTAMP(3),
    "durationMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inquiry_clientId_createdAt_idx" ON "Inquiry"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_vendorId_status_idx" ON "Inquiry"("vendorId", "status");

-- CreateIndex
CREATE INDEX "Inquiry_placementId_idx" ON "Inquiry"("placementId");

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Duplicate suppression (KAN-34): at most one open inquiry per client per placement. Prisma's
-- schema language cannot express a partial unique index, so it is added as raw SQL. Without it,
-- two submits racing past the application-level check would both insert.
CREATE UNIQUE INDEX "Inquiry_open_per_client_placement"
    ON "Inquiry" ("clientId", "placementId")
    WHERE "status" IN ('NEW', 'READ');
