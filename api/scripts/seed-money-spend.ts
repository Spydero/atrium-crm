import "dotenv/config";
import { LeadSource } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

/** Fill SourceSpend history so Money Map previous-period deltas work in the demo. */
async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "levante-demo" } });
  if (!org) throw new Error("levante-demo org not found");

  const amounts: Partial<Record<LeadSource, [number, number]>> = {
    BAYUT: [16000, 18000],
    PROPERTY_FINDER: [20000, 22000],
    DUBIZZLE: [11000, 9000],
    SKYLOOV: [4000, 4500],
    META: [6000, 7500],
    WEBSITE: [0, 0],
    REFERRAL: [0, 0],
    MANUAL: [0, 0],
  };

  const now = new Date();
  for (let back = 0; back < 6; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    for (const [source, pair] of Object.entries(amounts) as [LeadSource, [number, number]][]) {
      const amount = back >= 3 ? pair[0] : pair[1];
      await prisma.sourceSpend.upsert({
        where: {
          organizationId_source_month: {
            organizationId: org.id,
            source,
            month: d,
          },
        },
        create: { organizationId: org.id, source, month: d, amount },
        update: { amount },
      });
    }
  }

  // Leave GUIDE and WHATSAPP empty so the "missing spend" callout shows in the demo
  await prisma.sourceSpend.deleteMany({
    where: { organizationId: org.id, source: { in: ["GUIDE", "WHATSAPP"] } },
  });

  const n = await prisma.sourceSpend.count({ where: { organizationId: org.id } });
  const won = await prisma.lead.count({
    where: { organizationId: org.id, stage: "WON", wonAt: { not: null } },
  });
  console.log(`SourceSpend rows: ${n}; WON leads with wonAt: ${won}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
