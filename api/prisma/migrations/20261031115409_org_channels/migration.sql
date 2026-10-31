-- Org-configured channels (V1.6)
-- Purpose: replace hardcoded LeadSource / PortalName enums with org-owned channel keys.
-- Data impact: backfill OrgChannel per org; cast enum columns to text (lowercase keys); drop enabledPortals.
-- Reversal: restore enums from text (lossy for custom keys); re-add enabledPortals from PORTAL channels.

-- 1. Channel catalog
CREATE TYPE "ChannelKind" AS ENUM ('SYSTEM', 'PORTAL', 'ADS', 'OTHER');

CREATE TABLE "OrgChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ChannelKind" NOT NULL DEFAULT 'OTHER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgChannel_organizationId_key_key" ON "OrgChannel"("organizationId", "key");
CREATE INDEX "OrgChannel_organizationId_enabled_idx" ON "OrgChannel"("organizationId", "enabled");

ALTER TABLE "OrgChannel" ADD CONSTRAINT "OrgChannel_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Convert Lead.primarySource enum -> text (lowercase)
ALTER TABLE "Lead" ALTER COLUMN "primarySource" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "primarySource" TYPE TEXT USING (
  CASE "primarySource"::text
    WHEN 'MANUAL' THEN 'manual'
    WHEN 'BAYUT' THEN 'bayut'
    WHEN 'PROPERTY_FINDER' THEN 'property_finder'
    WHEN 'DUBIZZLE' THEN 'dubizzle'
    WHEN 'SKYLOOV' THEN 'skyloov'
    WHEN 'WHATSAPP' THEN 'whatsapp'
    WHEN 'META' THEN 'meta'
    WHEN 'REFERRAL' THEN 'referral'
    WHEN 'WEBSITE' THEN 'website'
    WHEN 'GUIDE' THEN 'guide'
    ELSE lower(replace("primarySource"::text, '_', '_'))
  END
);
ALTER TABLE "Lead" ALTER COLUMN "primarySource" SET DEFAULT 'manual';

-- 3. LeadSourceEvent.source
ALTER TABLE "LeadSourceEvent" ALTER COLUMN "source" TYPE TEXT USING (
  CASE "source"::text
    WHEN 'MANUAL' THEN 'manual'
    WHEN 'BAYUT' THEN 'bayut'
    WHEN 'PROPERTY_FINDER' THEN 'property_finder'
    WHEN 'DUBIZZLE' THEN 'dubizzle'
    WHEN 'SKYLOOV' THEN 'skyloov'
    WHEN 'WHATSAPP' THEN 'whatsapp'
    WHEN 'META' THEN 'meta'
    WHEN 'REFERRAL' THEN 'referral'
    WHEN 'WEBSITE' THEN 'website'
    WHEN 'GUIDE' THEN 'guide'
    ELSE lower("source"::text)
  END
);

-- 4. SourceSpend.source
ALTER TABLE "SourceSpend" ALTER COLUMN "source" TYPE TEXT USING (
  CASE "source"::text
    WHEN 'MANUAL' THEN 'manual'
    WHEN 'BAYUT' THEN 'bayut'
    WHEN 'PROPERTY_FINDER' THEN 'property_finder'
    WHEN 'DUBIZZLE' THEN 'dubizzle'
    WHEN 'SKYLOOV' THEN 'skyloov'
    WHEN 'WHATSAPP' THEN 'whatsapp'
    WHEN 'META' THEN 'meta'
    WHEN 'REFERRAL' THEN 'referral'
    WHEN 'WEBSITE' THEN 'website'
    WHEN 'GUIDE' THEN 'guide'
    ELSE lower("source"::text)
  END
);

-- 5. ListingPortalStatus.portal
ALTER TABLE "ListingPortalStatus" ALTER COLUMN "portal" TYPE TEXT USING (
  CASE "portal"::text
    WHEN 'BAYUT' THEN 'bayut'
    WHEN 'PROPERTY_FINDER' THEN 'property_finder'
    WHEN 'DUBIZZLE' THEN 'dubizzle'
    WHEN 'SKYLOOV' THEN 'skyloov'
    ELSE lower("portal"::text)
  END
);

-- 6. PortalBudget.portal
ALTER TABLE "PortalBudget" ALTER COLUMN "portal" TYPE TEXT USING (
  CASE "portal"::text
    WHEN 'BAYUT' THEN 'bayut'
    WHEN 'PROPERTY_FINDER' THEN 'property_finder'
    WHEN 'DUBIZZLE' THEN 'dubizzle'
    WHEN 'SKYLOOV' THEN 'skyloov'
    ELSE lower("portal"::text)
  END
);

-- 7. Drop old enums (no longer referenced)
DROP TYPE "LeadSource";
DROP TYPE "PortalName";

-- 8. Backfill OrgChannel: system channels for every org
INSERT INTO "OrgChannel" ("id", "organizationId", "key", "label", "kind", "enabled", "sortOrder", "createdAt", "updatedAt")
SELECT
  md5(o.id || ':' || s.key),
  o.id,
  s.key,
  s.label,
  'SYSTEM'::"ChannelKind",
  true,
  s.sort_order,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (
  VALUES
    ('manual', 'Manual', 10),
    ('referral', 'Referral', 20),
    ('website', 'Website', 30),
    ('whatsapp', 'WhatsApp', 40),
    ('guide', 'Guide', 50)
) AS s(key, label, sort_order)
ON CONFLICT ("organizationId", "key") DO NOTHING;

-- 9. Portals that were enabled on the org (legacy enabledPortals)
INSERT INTO "OrgChannel" ("id", "organizationId", "key", "label", "kind", "enabled", "sortOrder", "createdAt", "updatedAt")
SELECT
  md5(o.id || ':portal:' || lower(p.portal)),
  o.id,
  CASE upper(p.portal)
    WHEN 'BAYUT' THEN 'bayut'
    WHEN 'PROPERTY_FINDER' THEN 'property_finder'
    WHEN 'DUBIZZLE' THEN 'dubizzle'
    WHEN 'SKYLOOV' THEN 'skyloov'
    ELSE lower(replace(p.portal, ' ', '_'))
  END,
  CASE upper(p.portal)
    WHEN 'BAYUT' THEN 'Bayut'
    WHEN 'PROPERTY_FINDER' THEN 'PropertyFinder'
    WHEN 'DUBIZZLE' THEN 'Dubizzle'
    WHEN 'SKYLOOV' THEN 'Skyloov'
    ELSE initcap(replace(lower(p.portal), '_', ' '))
  END,
  'PORTAL'::"ChannelKind",
  true,
  100,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN LATERAL unnest(o."enabledPortals") AS p(portal)
ON CONFLICT ("organizationId", "key") DO NOTHING;

-- 10. Any source keys seen on leads / events / spend that are not yet channels
INSERT INTO "OrgChannel" ("id", "organizationId", "key", "label", "kind", "enabled", "sortOrder", "createdAt", "updatedAt")
SELECT DISTINCT ON (x."organizationId", x.key)
  md5(x."organizationId" || ':seen:' || x.key),
  x."organizationId",
  x.key,
  CASE x.key
    WHEN 'bayut' THEN 'Bayut'
    WHEN 'property_finder' THEN 'PropertyFinder'
    WHEN 'dubizzle' THEN 'Dubizzle'
    WHEN 'skyloov' THEN 'Skyloov'
    WHEN 'meta' THEN 'Meta ads'
    WHEN 'whatsapp' THEN 'WhatsApp'
    WHEN 'manual' THEN 'Manual'
    WHEN 'referral' THEN 'Referral'
    WHEN 'website' THEN 'Website'
    WHEN 'guide' THEN 'Guide'
    ELSE initcap(replace(x.key, '_', ' '))
  END,
  CASE
    WHEN x.key IN ('manual', 'referral', 'website', 'whatsapp', 'guide') THEN 'SYSTEM'::"ChannelKind"
    WHEN x.key IN ('bayut', 'property_finder', 'dubizzle', 'skyloov') THEN 'PORTAL'::"ChannelKind"
    WHEN x.key = 'meta' THEN 'ADS'::"ChannelKind"
    ELSE 'OTHER'::"ChannelKind"
  END,
  true,
  200,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT l."organizationId", l."primarySource" AS key FROM "Lead" l
  UNION
  SELECT l."organizationId", e.source AS key
  FROM "LeadSourceEvent" e
  JOIN "Lead" l ON l.id = e."leadId"
  UNION
  SELECT s."organizationId", s.source AS key FROM "SourceSpend" s
  UNION
  SELECT li."organizationId", lp.portal AS key
  FROM "ListingPortalStatus" lp
  JOIN "Listing" li ON li.id = lp."listingId"
) x
WHERE x.key IS NOT NULL AND x.key <> ''
ON CONFLICT ("organizationId", "key") DO NOTHING;

-- 11. Drop legacy enabledPortals array (catalog replaces it)
ALTER TABLE "Organization" DROP COLUMN "enabledPortals";
