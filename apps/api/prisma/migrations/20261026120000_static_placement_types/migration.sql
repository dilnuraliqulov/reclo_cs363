-- Restrict placement types to static Phase 1 options.
ALTER TABLE "Placement" ALTER COLUMN "type" DROP DEFAULT;
ALTER TYPE "PlacementType" RENAME TO "PlacementType_old";
CREATE TYPE "PlacementType" AS ENUM ('BILLBOARD', 'LED_SCREEN');

UPDATE "Placement"
SET "type" = 'BILLBOARD'
WHERE "type" IN ('WALL_MURAL', 'CITY_FORMAT');

ALTER TABLE "Placement"
ALTER COLUMN "type" TYPE "PlacementType"
USING ("type"::text::"PlacementType");
ALTER TABLE "Placement" ALTER COLUMN "type" SET DEFAULT 'BILLBOARD';
DROP TYPE "PlacementType_old";

-- LED-specific metadata for digital screens.
ALTER TABLE "Placement"
ADD COLUMN "ledDurationSeconds" INTEGER,
ADD COLUMN "ledPlaysPerDay" INTEGER;

ALTER TABLE "Placement"
ADD CONSTRAINT "Placement_ledDurationSeconds_positive"
CHECK ("ledDurationSeconds" IS NULL OR "ledDurationSeconds" > 0),
ADD CONSTRAINT "Placement_ledPlaysPerDay_positive"
CHECK ("ledPlaysPerDay" IS NULL OR "ledPlaysPerDay" > 0);
