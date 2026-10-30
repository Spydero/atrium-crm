-- V1.1 (commit cfb1f33, 2026-10-31): market settings and map coordinates.
-- Organization: currencyCode, currencyLabel, defaultCity, enabledPortals.
-- Listing: lat, lng, placeId; city now defaults to ''.
-- Data impact: additive columns with defaults, existing rows are filled by the defaults. Applies after v1_init.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'AED',
ADD COLUMN     "currencyLabel" TEXT NOT NULL DEFAULT 'AED',
ADD COLUMN     "defaultCity" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "enabledPortals" TEXT[] DEFAULT ARRAY['BAYUT', 'PROPERTY_FINDER', 'DUBIZZLE', 'SKYLOOV']::TEXT[];

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "placeId" TEXT,
ALTER COLUMN "city" SET DEFAULT '';

