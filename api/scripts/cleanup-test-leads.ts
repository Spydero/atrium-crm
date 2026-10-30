import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { deleteGuideFile } from "../src/lib/guideStorage.js";

/**
 * Removes data created by the UI tests: leads named "UITest...", leads from
 * the @uitest.example email domain, and guides titled "UITest...".
 */
const guides = await prisma.guide.findMany({ where: { title: { startsWith: "UITest" } } });
for (const g of guides) deleteGuideFile(g.filePath);
await prisma.guide.deleteMany({ where: { id: { in: guides.map((g) => g.id) } } });

await prisma.guideRequest.deleteMany({ where: { email: { endsWith: "@uitest.example" } } });

const leads = await prisma.lead.findMany({
  where: { OR: [{ name: { startsWith: "UITest" } }, { email: { endsWith: "@uitest.example" } }] },
  select: { id: true },
});
const ids = leads.map((l) => l.id);
await prisma.calendarEvent.deleteMany({ where: { leadId: { in: ids } } });
const res = await prisma.lead.deleteMany({ where: { id: { in: ids } } });
console.log(`removed ${res.count} test leads and ${guides.length} test guides`);
await prisma.$disconnect();
