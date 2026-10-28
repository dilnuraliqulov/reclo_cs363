-- DropIndex
DROP INDEX "Placement_vendorId_idx";

-- AlterTable
ALTER TABLE "Placement" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Placement_vendorId_status_idx" ON "Placement"("vendorId", "status");
