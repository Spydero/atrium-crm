-- Money Map V1.5: monthly spend per lead source + reliable win date
-- Purpose: let Money Map date-filter ROI and accept entered spend for every LeadSource
-- (not only the 4 portals). wonAt stops win dates from drifting when a won lead is edited.
-- Data impact: backfills wonAt for existing WON leads; copies PortalBudget > 0 into SourceSpend
-- for the current month. PortalBudget is left in place (unused by Money Map going forward).
-- Reversal: drop SourceSpend, drop Lead.wonAt; Money Map can fall back to PortalBudget.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "wonAt" TIMESTAMP(3);

-- Backfill wonAt from the latest stage activity that mentions WON, else updatedAt
UPDATE "Lead" l
SET "wonAt" = COALESCE(
  (
    SELECT a."createdAt"
    FROM "ActivityEvent" a
    WHERE a."leadId" = l."id"
      AND a."type" = 'stage'
      AND a."body" LIKE '%WON%'
    ORDER BY a."createdAt" DESC
    LIMIT 1
  ),
  l."updatedAt"
)
WHERE l."stage" = 'WON' AND l."wonAt" IS NULL;

-- CreateTable
CREATE TABLE "SourceSpend" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL,
    "month" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceSpend_organizationId_month_idx" ON "SourceSpend"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSpend_organizationId_source_month_key" ON "SourceSpend"("organizationId", "source", "month");

-- CreateIndex
CREATE INDEX "Lead_organizationId_wonAt_idx" ON "Lead"("organizationId", "wonAt");

-- AddForeignKey
ALTER TABLE "SourceSpend" ADD CONSTRAINT "SourceSpend_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSpend" ADD CONSTRAINT "SourceSpend_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copy live portal spend (> 0 only) into SourceSpend for the first day of the current month.
-- Zero PortalBudget rows from bootstrap mean "not entered" and are not copied.
INSERT INTO "SourceSpend" ("id", "organizationId", "source", "month", "amount", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  pb."organizationId",
  pb."portal"::text::"LeadSource",
  date_trunc('month', CURRENT_DATE)::date,
  pb."monthlySpendAed",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PortalBudget" pb
WHERE pb."monthlySpendAed" > 0
ON CONFLICT ("organizationId", "source", "month") DO NOTHING;
