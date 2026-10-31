-- Calendar V1.5: outcomes + notes for every event type
-- Purpose: every calendar item can be edited, noted, completed/cancelled, and deleted.
-- Data impact: null outcomes become SCHEDULED; outcomeAt backfilled from updatedAt when already closed.
-- Reversal: drop cancelReason, notes, outcomeAt, createdById; drop CancelReason enum; make outcome nullable again.

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('CLIENT', 'AGENT', 'LANDLORD', 'LISTING_UNAVAILABLE', 'RESCHEDULED', 'DUPLICATE', 'OTHER');

-- AlterTable: add columns first (outcome stays nullable until backfill)
ALTER TABLE "CalendarEvent" ADD COLUMN "cancelReason" "CancelReason",
ADD COLUMN "createdById" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "outcomeAt" TIMESTAMP(3);

-- Backfill null outcomes (follow-ups created outside POST)
UPDATE "CalendarEvent" SET "outcome" = 'SCHEDULED' WHERE "outcome" IS NULL;

-- Approximate: closed events get outcomeAt from updatedAt
UPDATE "CalendarEvent"
SET "outcomeAt" = "updatedAt"
WHERE "outcome" <> 'SCHEDULED' AND "outcomeAt" IS NULL;

-- Now make outcome required
ALTER TABLE "CalendarEvent" ALTER COLUMN "outcome" SET NOT NULL;

-- CreateIndex
CREATE INDEX "CalendarEvent_organizationId_startsAt_idx" ON "CalendarEvent"("organizationId", "startsAt");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
