/**
 * Demo data for the Guides feature: designed sample PDFs, published and draft guides,
 * a month of views, and many requests (some repeat people, some with downloads and deals).
 *
 * Content is deliberately neutral (no country specific rules). Run:
 *   npx tsx scripts/seed-guides.ts [orgSlug]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { buildGuidePdf, type GuideChapter } from "../src/lib/guidePdf.js";
import { saveGuideFile, deleteGuideFile } from "../src/lib/guideStorage.js";
import { checkPdf, dayKey, slugify } from "../src/lib/guideTools.js";
import { recordGuideRequest } from "../src/lib/guideService.js";

// Small deterministic random so screenshots are stable between runs
let seed = 20261031;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

type Demo = {
  title: string;
  subtitle: string;
  audience: "BUYER" | "SELLER" | "INVESTOR" | "RENTER" | "GENERAL";
  audienceLabel: string;
  summary: string;
  benefits: string[];
  gated: boolean;
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
  withFile: boolean;
  weight: number; // relative popularity
  intro: string;
  chapters: GuideChapter[];
  closing: { heading: string; text: string };
};

const demos: Demo[] = [
  {
    title: "The First-Time Buyer's Guide",
    subtitle: "A calm, step by step plan from first budget to getting the keys",
    audience: "BUYER",
    audienceLabel: "For buyers",
    summary:
      "Everything a first-time buyer needs in one short guide: how to set a realistic budget, what costs to expect on top of the price, how an offer works, and a checklist for viewing day.",
    benefits: [
      "How to set a budget and see the real total cost",
      "The buying process in plain language, step by step",
      "A viewing day checklist you can print",
      "Questions to ask before you make an offer",
    ],
    gated: true,
    status: "PUBLISHED",
    withFile: true,
    weight: 10,
    intro:
      "Buying a home is one of the biggest decisions you will make, and it is much easier with a plan. This guide walks through the journey in the order it happens, so you always know what comes next and what to ask.",
    chapters: [
      {
        title: "Know your budget",
        blocks: [
          { type: "p", text: "Start with what you can comfortably afford, not the largest figure a lender would offer. Your budget has three parts: the money you have ready, the monthly amount you can sustain, and a cushion for the unexpected." },
          { type: "h", text: "Costs beyond the price" },
          { type: "bullets", items: ["Deposit and any financing arrangement fees", "Transfer, registration and agent fees that apply where you buy", "Valuation, survey or inspection costs", "Moving, furnishing and first-month running costs"] },
          { type: "callout", title: "Rule of thumb", text: "Add up every one-off cost before you fall in love with a property. Surprises at the end of the process are the most common reason a purchase falls apart." },
        ],
      },
      {
        title: "How the process works",
        blocks: [
          { type: "p", text: "Every market has its own paperwork, but the sequence is similar almost everywhere. Knowing the shape of it removes most of the stress." },
          { type: "bullets", items: ["Decide your budget and your must-haves", "Get financing in principle if you need it", "Search, shortlist and view", "Make an offer and agree the terms", "Complete the legal checks and sign", "Pay, register and collect the keys"] },
          { type: "p", text: "Ask your agent to explain which of these steps are handled by an authority, which by a lawyer and which by you, so nothing is left to chance." },
        ],
      },
      {
        title: "Viewing day checklist",
        blocks: [
          { type: "p", text: "Photos are made to flatter. A viewing is your chance to check everything a photo cannot show. Take this list with you and tick as you go." },
          { type: "checklist", items: ["Natural light at the time of day you will be home", "Water pressure, taps and signs of damp", "Noise from the street, neighbours and building systems", "Storage, layout and where your furniture will go", "Parking, lifts, deliveries and building rules", "The journey to work, school and daily shops"] },
        ],
      },
      {
        title: "Making your offer",
        blocks: [
          { type: "p", text: "An offer is more than a number. Terms such as timing, what is included and conditions can matter as much as the price." },
          { type: "bullets", items: ["Compare with similar recent sales, not only asking prices", "Decide your walk-away figure before you negotiate", "Put every condition in writing", "Agree who pays which fees"] },
          { type: "callout", title: "Ask your advisor", text: "A good agent will show you the evidence behind a price. If you are unsure, ask for comparable properties and how long they took to sell." },
        ],
      },
    ],
    closing: {
      heading: "Talk it through with an advisor",
      text: "Book a free, no-obligation conversation. We will review your budget, shortlist areas that fit and explain the next steps for your situation.",
    },
  },
  {
    title: "Selling Your Home: The Seller's Guide",
    subtitle: "Prepare, price and present your property for the best result",
    audience: "SELLER",
    audienceLabel: "For sellers",
    summary:
      "A practical guide for owners thinking of selling: how to price with evidence, how to prepare and photograph the property, how viewings and offers work, and how to avoid common delays.",
    benefits: [
      "How to price with evidence instead of hope",
      "A preparation checklist that adds value cheaply",
      "What happens from first viewing to completion",
      "Mistakes that slow a sale down",
    ],
    gated: true,
    status: "PUBLISHED",
    withFile: true,
    weight: 6,
    intro:
      "A well prepared, well priced property sells faster and for more. This guide covers what to do before you list, how to run viewings, and how to handle offers with confidence.",
    chapters: [
      {
        title: "Price it right",
        blocks: [
          { type: "p", text: "Pricing is the single biggest lever you have. Too high and the property sits and loses momentum, too low and you leave money behind. The answer is evidence." },
          { type: "bullets", items: ["Recent sales of genuinely similar properties", "Current competing listings and how long they have been on the market", "Condition, view, floor and amenities compared with those properties", "Your own timeline and how flexible it is"] },
          { type: "callout", title: "Tip", text: "Ask for a written pricing opinion with the comparable properties listed, so you can judge the reasoning yourself." },
        ],
      },
      {
        title: "Prepare the property",
        blocks: [
          { type: "p", text: "Buyers decide in the first minute. Small, inexpensive preparation has the best return." },
          { type: "checklist", items: ["Deep clean and remove personal clutter", "Repair small defects, leaking taps and loose fittings", "Fresh neutral paint where walls are marked", "Bright, warm lighting and open curtains", "Gather documents: title, plans, service charges, certificates"] },
        ],
      },
      {
        title: "Viewings and offers",
        blocks: [
          { type: "p", text: "Be flexible with viewing times and let buyers explore without you in the room. When offers arrive, look beyond the headline number." },
          { type: "bullets", items: ["Is the buyer's financing confirmed?", "How long will they need to complete?", "Are there conditions attached?", "What is included in the price?"] },
        ],
      },
      {
        title: "From offer to completion",
        blocks: [
          { type: "p", text: "Once terms are agreed, most delays come from missing paperwork and slow responses. Keep your documents ready and respond within a day." },
          { type: "callout", title: "Stay in touch", text: "Ask your agent for a short written update every few days so you always know where the sale stands." },
        ],
      },
    ],
    closing: {
      heading: "Get a free, evidence-based valuation",
      text: "Tell us about your property and we will prepare a written pricing opinion with comparable properties and a clear selling plan.",
    },
  },
  {
    title: "The Property Investor's Handbook",
    subtitle: "Yield, risk and the questions to ask before you commit capital",
    audience: "INVESTOR",
    audienceLabel: "For investors",
    summary:
      "A concise handbook on evaluating an investment property: how to calculate yield, what drives demand, how to think about risk, and a due diligence checklist before you buy.",
    benefits: [
      "Gross and net yield explained with a worked example",
      "What drives rental demand and resale value",
      "A due diligence checklist",
      "Risks to plan for, and how to reduce them",
    ],
    gated: true,
    status: "PUBLISHED",
    withFile: true,
    weight: 8,
    intro:
      "A good investment is the one whose numbers still work when conditions are less than perfect. This handbook gives you a simple framework for comparing properties on equal terms.",
    chapters: [
      {
        title: "Understanding yield",
        blocks: [
          { type: "p", text: "Gross yield is the annual rent divided by the purchase price. Net yield subtracts running costs such as service charges, maintenance, management fees and periods without a tenant." },
          { type: "callout", title: "Worked example", text: "A property bought for 1,000,000 that rents for 70,000 a year has a gross yield of 7%. If costs and empty periods take 14,000, the net yield is 5.6%." },
          { type: "p", text: "Always compare net yield, and always compare like with like, including the cost of financing." },
        ],
      },
      {
        title: "What drives demand",
        blocks: [
          { type: "bullets", items: ["Jobs, transport and schools nearby", "Supply: how many similar units are being built", "The type of tenant the area attracts and their typical stay", "Building quality, amenities and service charges"] },
          { type: "p", text: "Demand that is broad and steady is worth more than demand that depends on a single employer or event." },
        ],
      },
      {
        title: "Due diligence checklist",
        blocks: [
          { type: "checklist", items: ["Confirm ownership and any charges on the property", "Review service charges and the building's finances", "Check rental history and realistic achievable rent", "Understand taxes and fees for non-resident owners where relevant", "Inspect the property and the building's condition", "Plan your exit: who is the next buyer?"] },
        ],
      },
      {
        title: "Managing risk",
        blocks: [
          { type: "p", text: "Risk cannot be removed, but it can be priced and planned for." },
          { type: "bullets", items: ["Keep a reserve for repairs and empty periods", "Avoid depending on the highest possible rent", "Diversify across property types or locations as you grow", "Stress test your numbers with higher costs and lower rent"] },
        ],
      },
    ],
    closing: {
      heading: "Review an opportunity with us",
      text: "Send us a property you are considering and we will walk through the numbers, comparable rents and risks with you.",
    },
  },
  {
    title: "The Renter's Checklist",
    subtitle: "Find, view and secure a rental with confidence",
    audience: "RENTER",
    audienceLabel: "For renters",
    summary:
      "A free checklist for renters: what to prepare, what to check during a viewing, and what to confirm in the agreement before you pay anything.",
    benefits: [
      "Documents to have ready before you start",
      "A viewing checklist",
      "What to confirm in the agreement",
      "Move-in tips to protect your deposit",
    ],
    gated: false,
    status: "PUBLISHED",
    withFile: true,
    weight: 5,
    intro:
      "Renting should feel simple. This short checklist helps you prepare, avoid surprises and move in with a clear understanding of what you have agreed.",
    chapters: [
      {
        title: "Before you search",
        blocks: [
          { type: "checklist", items: ["Set a monthly budget that includes running costs", "Decide your must-haves and nice-to-haves", "Prepare identification and proof of income", "Know your ideal move-in date and lease length"] },
        ],
      },
      {
        title: "Viewing checklist",
        blocks: [
          { type: "checklist", items: ["Test taps, lights, appliances and air conditioning or heating", "Look for damp, cracks and pests", "Check the mobile signal and internet options", "Ask what is included: furniture, parking, storage", "Note existing damage and take dated photos"] },
        ],
      },
      {
        title: "The agreement",
        blocks: [
          { type: "bullets", items: ["Who pays which bills and fees", "How and when rent is paid", "Deposit amount and how it is protected and returned", "Notice period and renewal terms", "Rules on repairs, pets and subletting"] },
          { type: "callout", title: "Before you pay", text: "Never transfer money before you have a written agreement and have confirmed the person you are paying is authorised to let the property." },
        ],
      },
    ],
    closing: {
      heading: "Need help finding a place?",
      text: "Tell us your budget and preferred areas and we will send you a shortlist of properties that fit.",
    },
  },
  {
    title: "Off-Plan Buying Basics",
    subtitle: "What to understand before you buy a property that is not built yet",
    audience: "INVESTOR",
    audienceLabel: "For buyers and investors",
    summary:
      "An introduction to buying property before it is completed: how payment plans work, what to check about the developer and the project, and the risks and rewards to weigh up.",
    benefits: [
      "How payment plans and milestones work",
      "How to check a developer's track record",
      "Risks and rewards in plain language",
      "Questions to ask before you reserve",
    ],
    gated: true,
    status: "PUBLISHED",
    withFile: true,
    weight: 4,
    intro:
      "Buying before construction ends can mean flexible payments and a lower entry price, but it asks for patience and careful checking. This guide helps you decide whether it suits you.",
    chapters: [
      {
        title: "How payment plans work",
        blocks: [
          { type: "p", text: "Most plans split the price into a booking amount, instalments linked to construction milestones, and a final payment on handover. Ask for the full schedule in writing." },
          { type: "callout", title: "Check", text: "Find out where your money is held, and what protections exist if a milestone is missed or the project is delayed." },
        ],
      },
      {
        title: "Checking the developer",
        blocks: [
          { type: "checklist", items: ["Completed projects and how they were delivered", "Delivery dates promised versus achieved", "Financial standing and any public disputes", "Quality of finishes in earlier buildings", "Registration of the project with the relevant authority"] },
        ],
      },
      {
        title: "Risks and rewards",
        blocks: [
          { type: "bullets", items: ["Lower entry price and staged payments", "Choice of units, floors and views", "Delays, changes to specification or market movement before handover", "Resale rules before completion vary by location"] },
        ],
      },
    ],
    closing: {
      heading: "Let us check the project with you",
      text: "Share the project you are considering and we will help you review the developer, payment plan and the questions to ask.",
    },
  },
  {
    title: "Relocation Guide for New Arrivals",
    subtitle: "Choosing a neighbourhood, schools and getting settled",
    audience: "GENERAL",
    audienceLabel: "For people relocating",
    summary:
      "A guide in preparation for people moving to the area: neighbourhood comparison, schools and commute, and a first-month settling-in plan.",
    benefits: [
      "How to compare neighbourhoods",
      "Schools and commute planning",
      "A first-month settling-in plan",
    ],
    gated: true,
    status: "DRAFT",
    withFile: false,
    weight: 0,
    intro: "",
    chapters: [],
    closing: { heading: "", text: "" },
  },
  {
    title: "Spring Market Outlook",
    subtitle: "Seasonal snapshot for buyers and sellers",
    audience: "GENERAL",
    audienceLabel: "Market note",
    summary: "A short seasonal market note that has now been replaced by a newer edition.",
    benefits: ["Seasonal demand patterns", "What sellers and buyers should expect"],
    gated: true,
    status: "ARCHIVED",
    withFile: true,
    weight: 1,
    intro: "A short seasonal note for buyers and sellers. This edition has been retired.",
    chapters: [
      {
        title: "Seasonal patterns",
        blocks: [{ type: "p", text: "Activity tends to rise after the holiday period and ease in peak summer. Local patterns differ, so ask your advisor for current figures." }],
      },
    ],
    closing: { heading: "Ask for the latest edition", text: "A newer market note is available on request." },
  },
];

const FIRST = ["Aisha", "Daniel", "Priya", "Marcus", "Layla", "Tomas", "Nadia", "Ethan", "Sofia", "Karim", "Hannah", "Rohan", "Mariam", "Lucas", "Zara", "Viktor", "Amira", "Noah", "Elena", "Samir", "Chloe", "Yusuf", "Ingrid", "Arjun", "Leila", "Oscar", "Mei", "Tariq"];
const LAST = ["Rahman", "Okafor", "Nair", "Fischer", "Haddad", "Novak", "Qureshi", "Bennett", "Moreau", "Khalil", "Sorensen", "Mehta", "Farouk", "Silva", "Ali", "Petrov", "Saleh", "Walsh", "Rossi", "Hamdan", "Dubois", "Aziz", "Larsen", "Kapoor", "Nasser", "Berg", "Chen", "Jabr"];

const CHANNELS: { source: string | null; medium: string | null; campaign: string | null; referrer: string | null; w: number }[] = [
  { source: "instagram", medium: "social", campaign: "buyer-guide-launch", referrer: null, w: 24 },
  { source: "google", medium: "cpc", campaign: "first-time-buyers", referrer: null, w: 22 },
  { source: "newsletter", medium: "email", campaign: "monthly-update", referrer: null, w: 14 },
  { source: "whatsapp", medium: "share", campaign: null, referrer: null, w: 10 },
  { source: "open-house", medium: "qr", campaign: "weekend-viewings", referrer: null, w: 12 },
  { source: null, medium: null, campaign: null, referrer: "https://www.facebook.com", w: 8 },
  { source: null, medium: null, campaign: null, referrer: null, w: 20 },
];
const pickChannel = () => {
  const total = CHANNELS.reduce((a, c) => a + c.w, 0);
  let r = rnd() * total;
  for (const c of CHANNELS) {
    r -= c.w;
    if (r <= 0) return c;
  }
  return CHANNELS[0];
};

async function main() {
  const slug = process.argv[2] || "levante-demo";
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization with slug ${slug}. Run npm run db:seed first.`);
  const users = await prisma.user.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } });
  const agent = users.find((u) => u.email === "agent@atrium.demo") ?? users[0];
  const owner = users.find((u) => u.email === "owner@atrium.demo") ?? users[0];

  await prisma.organization.update({
    where: { id: org.id },
    data: { privacyUrl: "https://levante-demo.example/privacy", licenseLabel: "Licence no.", licenseNumber: "LIC-48213" },
  });

  // Reset previous demo guides (and their demo leads) so this script can be re-run
  const old = await prisma.guide.findMany({ where: { organizationId: org.id } });
  for (const g of old) deleteGuideFile(g.filePath);
  await prisma.guide.deleteMany({ where: { organizationId: org.id } });
  await prisma.calendarEvent.deleteMany({
    where: { organizationId: org.id, title: { startsWith: "Follow up:" }, lead: { email: { endsWith: "@example.com" } } },
  });
  await prisma.lead.deleteMany({
    where: { organizationId: org.id, primarySource: "GUIDE", email: { endsWith: "@example.com" } },
  });

  const now = new Date();
  const created: { id: string; title: string; weight: number; gated: boolean; status: string; ownerId: string }[] = [];

  for (const [i, d] of demos.entries()) {
    let filePath: string | null = null;
    let fileBytes: number | null = null;
    let pageCount: number | null = null;
    if (d.withFile) {
      const pdf = await buildGuidePdf({
        org: { name: org.name, licenseLabel: "Licence no.", licenseNumber: "LIC-48213" },
        title: d.title,
        subtitle: d.subtitle,
        audienceLabel: d.audienceLabel,
        intro: d.intro,
        chapters: d.chapters,
        closing: d.closing,
        updated: new Date(now.getTime() - (i + 1) * 9 * 86_400_000),
      });
      const check = checkPdf(pdf);
      if (!check.ok) throw new Error(`Generated PDF failed validation: ${check.error}`);
      filePath = saveGuideFile(pdf);
      fileBytes = pdf.length;
      pageCount = check.pageCount;
    }
    const ownerId = i % 3 === 2 ? owner.id : agent.id;
    const g = await prisma.guide.create({
      data: {
        organizationId: org.id,
        slug: slugify(d.title),
        title: d.title,
        subtitle: d.subtitle,
        audience: d.audience,
        summary: d.summary,
        benefits: d.benefits,
        gated: d.gated,
        status: d.status,
        ownerId,
        filePath,
        fileName: filePath ? `${slugify(d.title)}.pdf` : null,
        fileBytes,
        pageCount,
        ctaText: d.status === "DRAFT" ? "" : "Book a free consultation to talk it through.",
        permitNumber: i === 4 ? "PRM-2026-0417" : null,
        publishedAt: d.status === "DRAFT" ? null : new Date(now.getTime() - (30 - i) * 86_400_000),
      },
    });
    created.push({ id: g.id, title: g.title, weight: d.weight, gated: d.gated, status: d.status, ownerId });
  }

  // A month of page views per live guide (weekdays busier), plus open downloads for the ungated guide
  for (const g of created.filter((x) => x.weight > 0)) {
    for (let back = 0; back < 31; back++) {
      const day = new Date(now.getTime() - back * 86_400_000);
      const weekday = day.getDay() !== 0 && day.getDay() !== 6;
      const archived = g.status === "ARCHIVED" && back < 12;
      if (archived) continue;
      const views = Math.round(g.weight * (weekday ? 0.9 : 0.4) * (0.6 + rnd() * 0.9));
      const downloads = !g.gated ? Math.round(views * (0.15 + rnd() * 0.2)) : 0;
      if (views + downloads === 0) continue;
      await prisma.guideDailyStat.create({
        data: { guideId: g.id, date: dayKey(day), views, downloads },
      });
    }
  }

  // People who request guides. Some ask twice (same email), some by phone only match, so Lead Fuse is exercised.
  const people = FIRST.map((f, i) => ({
    name: `${f} ${LAST[i % LAST.length]}`,
    email: `${f}.${LAST[i % LAST.length]}`.toLowerCase() + "@example.com",
    phone: i % 3 === 0 ? null : `+9715${String(50000000 + Math.floor(rnd() * 49999999)).slice(0, 8)}`,
  }));

  const live = created.filter((g) => g.status !== "DRAFT");
  const weighted = live.flatMap((g) => Array<typeof g>(Math.max(1, g.weight)).fill(g));
  let requests = 0;
  const touchedLeads = new Set<string>();
  const total = 46;
  for (let n = 0; n < total; n++) {
    const person = n < people.length ? people[n] : pick(people);
    const guide = pick(weighted);
    const g = created.find((x) => x.id === guide.id)!;
    const back = Math.floor(rnd() * rnd() * 29.9 * 1) + (rnd() < 0.5 ? 0 : Math.floor(rnd() * 10));
    const at = new Date(now.getTime() - Math.min(back, 29) * 86_400_000 - Math.floor(rnd() * 12) * 3_600_000);
    const ch = pickChannel();
    const res = await recordGuideRequest(
      { id: g.id, organizationId: org.id, title: g.title, ownerId: g.ownerId },
      { name: org.name },
      {
        name: person.name,
        email: person.email,
        phone: person.phone,
        consentMarketing: rnd() < 0.55,
        utmSource: ch.source,
        utmMedium: ch.medium,
        utmCampaign: ch.campaign,
        referrer: ch.referrer,
        ipHash: null,
      },
      at,
    );
    requests += 1;
    touchedLeads.add(res.leadId);
    // most people actually open the file, a few open it again
    if (rnd() < 0.78) {
      const times = rnd() < 0.2 ? 2 : 1;
      await prisma.guideRequest.update({
        where: { id: res.request.id },
        data: {
          downloadCount: times,
          firstDownloadedAt: new Date(at.getTime() + 40_000),
          lastDownloadedAt: new Date(at.getTime() + 40_000 + (times - 1) * 3_600_000),
        },
      });
    }
  }

  // Move some guide leads through the pipeline so reports show progression
  const leads = await prisma.lead.findMany({
    where: { organizationId: org.id, primarySource: "GUIDE", email: { endsWith: "@example.com" } },
    orderBy: { createdAt: "asc" },
  });
  const stages = ["QUALIFIED", "QUALIFIED", "VIEWING", "VIEWING", "OFFER", "WON", "LOST", "QUALIFIED", "VIEWING", "WON"] as const;
  for (const [i, lead] of leads.entries()) {
    const stage = stages[i];
    if (!stage) break;
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        stage,
        budgetMax: stage === "WON" ? 1_800_000 : 1_200_000 + i * 150_000,
        dealValueAed: stage === "WON" ? 1_750_000 : null,
        firstRespondedAt: new Date(lead.createdAt.getTime() + 25 * 60_000),
      },
    });
  }

  const counts = await Promise.all([
    prisma.guide.count({ where: { organizationId: org.id } }),
    prisma.guideRequest.count({ where: { guide: { organizationId: org.id } } }),
    prisma.lead.count({ where: { organizationId: org.id, primarySource: "GUIDE" } }),
  ]);
  console.log(
    `Seeded ${counts[0]} guides, ${counts[1]} requests (${requests} submitted), ${counts[2]} guide leads for ${org.slug}.`,
  );
  void touchedLeads;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
