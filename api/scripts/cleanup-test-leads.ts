import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

/** Removes leads created by the UI tests (names start with "UITest"). */
const leads = await prisma.lead.findMany({
  where: { name: { startsWith: "UITest" } },
  select: { id: true },
});
const ids = leads.map((l) => l.id);
await prisma.calendarEvent.deleteMany({ where: { leadId: { in: ids } } });
const res = await prisma.lead.deleteMany({ where: { id: { in: ids } } });
console.log(`removed ${res.count} test leads`);
await prisma.$disconnect();
