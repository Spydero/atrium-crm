import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

/** Fill SourceSpend history so Money Map previous-period deltas work in the demo. */
async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "levante-demo" } });
  if (!org) throw new Error("levante-demo org not found");

  const amounts: Record<string, [number, number]> = {
    bayut: [16000, 18000],
    property_finder: [20000, 22000],
    dubizzle: [11000, 9000],
    skyloov: [4000, 4500],
    meta: [6000, 7500],
    website: [0, 0],
    referral: [0, 0],
    manual: [0, 0],
  };

  const now = new Date();
  for (let back = 0; back < 6; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    for (const [source, pair] of Object.entries(amounts)) {
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

  // Leave guide and whatsapp empty so the "missing spend" callout shows in the demo
  await prisma.sourceSpend.deleteMany({
    where: { organizationId: org.id, source: { in: ["guide", "whatsapp"] } },
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
