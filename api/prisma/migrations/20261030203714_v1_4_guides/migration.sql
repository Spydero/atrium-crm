-- V1.4 (commit 471f97f, 2026-10-31): downloadable guides.
-- New tables: Guide, GuideRequest, GuideDailyStat. New enums: GuideAudience, GuideStatus.
-- LeadSource gains GUIDE. Organization gains privacyUrl, licenseLabel, licenseNumber.
-- Lead.phone becomes optional (email-only guide leads). No data is removed or rewritten.
-- Note: the new enum value GUIDE cannot be used in the same transaction that adds it; nothing here uses it.

-- CreateEnum
CREATE TYPE "GuideAudience" AS ENUM ('BUYER', 'SELLER', 'INVESTOR', 'RENTER', 'GENERAL');

-- CreateEnum
CREATE TYPE "GuideStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'GUIDE';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "licenseLabel" TEXT NOT NULL DEFAULT 'Licence no.',
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "privacyUrl" TEXT;

-- AlterTable
ALTER TABLE "Lead" ALTER COLUMN "phone" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Guide" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "audience" "GuideAudience" NOT NULL DEFAULT 'GENERAL',
    "summary" TEXT NOT NULL DEFAULT '',
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coverUrl" TEXT,
    "pageCount" INTEGER,
    "status" "GuideStatus" NOT NULL DEFAULT 'DRAFT',
    "gated" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "fileBytes" INTEGER,
    "permitNumber" TEXT,
    "ctaText" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideRequest" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "leadId" TEXT,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "consentMarketing" BOOLEAN NOT NULL DEFAULT false,
    "consentText" TEXT NOT NULL DEFAULT '',
    "consentVersion" INTEGER NOT NULL DEFAULT 1,
    "consentAt" TIMESTAMP(3),
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "referrer" TEXT,
    "ipHash" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "firstDownloadedAt" TIMESTAMP(3),
    "lastDownloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideDailyStat" (
    "guideId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuideDailyStat_pkey" PRIMARY KEY ("guideId","date")
);

-- CreateIndex
CREATE INDEX "Guide_organizationId_status_idx" ON "Guide"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Guide_organizationId_slug_key" ON "Guide"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "GuideRequest_token_key" ON "GuideRequest"("token");

-- CreateIndex
CREATE INDEX "GuideRequest_guideId_createdAt_idx" ON "GuideRequest"("guideId", "createdAt");

-- CreateIndex
CREATE INDEX "GuideRequest_leadId_idx" ON "GuideRequest"("leadId");

-- AddForeignKey
ALTER TABLE "Guide" ADD CONSTRAINT "Guide_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guide" ADD CONSTRAINT "Guide_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideRequest" ADD CONSTRAINT "GuideRequest_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideRequest" ADD CONSTRAINT "GuideRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideDailyStat" ADD CONSTRAINT "GuideDailyStat_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

