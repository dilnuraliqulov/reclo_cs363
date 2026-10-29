-- CreateTable
CREATE TABLE "PlacementPricing" (
    "placementId" TEXT NOT NULL,
    "terms" INTEGER[],
    "durations" INTEGER[],
    "prices" JSONB NOT NULL,
    "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vatRate" INTEGER NOT NULL DEFAULT 1200,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlacementPricing_pkey" PRIMARY KEY ("placementId")
);

-- AddForeignKey
ALTER TABLE "PlacementPricing" ADD CONSTRAINT "PlacementPricing_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
