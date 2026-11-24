-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "lostAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_organizationId_lostAt_idx" ON "Lead"("organizationId", "lostAt");

-- Backfill terminal clocks from updatedAt where missing
UPDATE "Lead" SET "wonAt" = "updatedAt" WHERE "stage" = 'WON' AND "wonAt" IS NULL;
UPDATE "Lead" SET "lostAt" = "updatedAt" WHERE "stage" = 'LOST' AND "lostAt" IS NULL;
