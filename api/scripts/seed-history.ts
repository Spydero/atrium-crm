/**
 * Demo history for the dashboard trends: about a year of leads (growing, with weekday and
 * seasonal rhythm), their source events, viewings with outcomes, and closed deals.
 * All records use the @history.example email domain so this script can be re-run safely.
 *
 *   npx tsx scripts/seed-history.ts [orgSlug]
 */
import "dotenv/config";
import type { LeadStage, ViewingOutcome } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

const DOMAIN = "history.example";
const MONTHS = 12;

let seed = 31102026;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (a: number, b: number) => a + rnd() * (b - a);
function weighted<T>(rows: [T, number][]): T {
  const total = rows.reduce((s, r) => s + r[1], 0);
  let x = rnd() * total;
  for (const [v, w] of rows) {
    x -= w;
    if (x <= 0) return v;
  }
  return rows[rows.length - 1][0];
}

const FIRST = ["Amira", "Karim", "Layla", "Omar", "Noor", "Yusuf", "Hana", "Tariq", "Mariam", "Faisal", "Dina", "Sami", "Rania", "Zaid", "Lina", "Hadi", "Salma", "Nabil", "Aya", "Rashid", "Elena", "Viktor", "Priya", "Arjun", "Sofia", "Lucas", "Mei", "Daniel", "Chloe", "Ivan"];
const LAST = ["Haddad", "Nasser", "Farouk", "Mansour", "Khalil", "Saleh", "Aziz", "Hamdan", "Barakat", "Sharif", "Petrov", "Nair", "Kapoor", "Rossi", "Larsen", "Weber", "Tanaka", "Silva", "Moreau", "Novak"];

const SOURCES: [string, number][] = [
  ["bayut", 24],
  ["property_finder", 24],
  ["dubizzle", 10],
  ["skyloov", 4],
  ["whatsapp", 8],
  ["meta", 8],
  ["referral", 7],
  ["website", 9],
  ["manual", 6],
];

function stageFor(ageDays: number): LeadStage {
  if (ageDays < 10)
    return weighted<LeadStage>([["NEW", 40], ["QUALIFIED", 30], ["VIEWING", 20], ["OFFER", 10]]);
  if (ageDays < 45)
    return weighted<LeadStage>([["NEW", 6], ["QUALIFIED", 18], ["VIEWING", 12], ["OFFER", 8], ["WON", 8], ["LOST", 48]]);
  return weighted<LeadStage>([["QUALIFIED", 5], ["VIEWING", 2], ["WON", 14], ["LOST", 79]]);
}

async function main() {
  const slug = process.argv[2] || "levante-demo";
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug } });
  const users = await prisma.user.findMany({ where: { organizationId: org.id }, select: { id: true } });
  const listings = await prisma.listing.findMany({
    where: { organizationId: org.id, status: "ACTIVE" },
    select: { id: true, priceAed: true },
  });

  // Clean previous run
  const old = await prisma.lead.findMany({
    where: { organizationId: org.id, email: { endsWith: `@${DOMAIN}` } },
    select: { id: true },
  });
  if (old.length) {
    const ids = old.map((l) => l.id);
    await prisma.calendarEvent.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  }

  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - MONTHS);
  start.setHours(0, 0, 0, 0);

  let n = 0;
  let viewings = 0;
  let won = 0;
  const day = new Date(start);
  while (day <= now) {
    const progress = (day.getTime() - start.getTime()) / (now.getTime() - start.getTime());
    const season = 1 + 0.3 * Math.sin(((day.getMonth() - 1) / 12) * Math.PI * 2);
    const dow = day.getDay(); // 0 Sun .. 6 Sat
    const weekday = dow === 0 || dow === 6 ? 0.55 : dow === 2 || dow === 3 ? 1.2 : 1;
    const lambda = (0.35 + 0.75 * progress) * season * weekday;
    const count = Math.floor(lambda + rnd());

    for (let k = 0; k < count; k++) {
      const createdAt = new Date(day);
      createdAt.setHours(8 + Math.floor(rnd() * 13), Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
      if (createdAt > now) continue;
      const ageDays = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);
      const stage = stageFor(ageDays);
      const source = weighted(SOURCES);
      const first = FIRST[Math.floor(rnd() * FIRST.length)];
      const last = LAST[Math.floor(rnd() * LAST.length)];
      const listing = listings.length && rnd() < 0.7 ? listings[Math.floor(rnd() * listings.length)] : null;
      const assigned = users.length ? users[Math.floor(rnd() * users.length)].id : null;

      let updatedAt = createdAt;
      if (stage !== "NEW") {
        const span = stage === "WON" ? between(10, 60) : stage === "LOST" ? between(3, 40) : between(1, 12);
        updatedAt = new Date(Math.min(now.getTime(), createdAt.getTime() + span * 86400000));
      }
      const dealValue =
        stage === "NEW" || stage === "LOST" ? null : Math.round(between(0.5, 2.6) * 10) * 100000;

      const lead = await prisma.lead.create({
        data: {
          organizationId: org.id,
          name: `${first} ${last}`,
          email: `${first}.${last}.${n}@${DOMAIN}`.toLowerCase(),
          phone: `+97155${String(2000000 + n * 37).slice(-7)}`,
          stage,
          primarySource: source,
          listingId: listing?.id ?? null,
          assignedToId: assigned,
          dealValueAed: dealValue,
          createdAt,
          updatedAt,
          firstRespondedAt: new Date(createdAt.getTime() + between(5, 240) * 60000),
          sources: { create: [{ source, listingId: listing?.id ?? null, createdAt }] },
          activities: {
            create: [
              { type: "created", body: `Lead captured from ${source.replace("_", " ").toLowerCase()}`, createdAt },
              ...(stage !== "NEW"
                ? [{ type: "stage", body: `Stage moved NEW → ${stage}`, createdAt: updatedAt }]
                : []),
            ],
          },
        },
      });
      n++;
      if (stage === "WON") won++;

      // Viewings
      const viewed =
        stage === "VIEWING" || stage === "OFFER" || stage === "WON" ? rnd() < 0.95 : stage === "LOST" ? rnd() < 0.3 : false;
      if (viewed) {
        const rounds = stage === "WON" && rnd() < 0.5 ? 2 : 1;
        for (let r = 0; r < rounds; r++) {
          const startsAt = new Date(createdAt.getTime() + between(2 + r * 3, 12 + r * 4) * 86400000);
          startsAt.setHours(10 + Math.floor(rnd() * 8), rnd() < 0.5 ? 0 : 30, 0, 0);
          if (startsAt >= now) continue;
          const outcome: ViewingOutcome =
            stage === "LOST"
              ? weighted<ViewingOutcome>([["COMPLETED", 55], ["NO_SHOW", 30], ["CANCELLED", 15]])
              : weighted<ViewingOutcome>([["COMPLETED", 88], ["NO_SHOW", 7], ["CANCELLED", 5]]);
          await prisma.calendarEvent.create({
            data: {
              organizationId: org.id,
              title: `Viewing - ${first} ${last}`,
              type: "VIEWING",
              startsAt,
              endsAt: new Date(startsAt.getTime() + 45 * 60000),
              leadId: lead.id,
              listingId: listing?.id ?? null,
              outcome,
              feedback: outcome === "COMPLETED" && rnd() < 0.5 ? "Liked the layout, comparing options." : null,
            },
          });
          viewings++;
        }
      }
    }
    day.setDate(day.getDate() + 1);
  }

  console.log(`Seeded ${n} historic leads (${won} won) and ${viewings} viewings over ${MONTHS} months for ${slug}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
