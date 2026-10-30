import "dotenv/config";
import { prisma } from "./lib/prisma.js";
import { auth } from "./lib/auth.js";

async function main() {
  console.log("Seeding Atrium…");

  await prisma.shortlistItem.deleteMany();
  await prisma.shortlist.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.leadNote.deleteMany();
  await prisma.leadSourceEvent.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.listingPortalStatus.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.portalBudget.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: {
      name: "Levante Demo Realty",
      slug: "levante-demo",
      portalBudgets: {
        create: [
          { portal: "BAYUT", monthlySpendAed: 18000 },
          { portal: "PROPERTY_FINDER", monthlySpendAed: 22000 },
          { portal: "DUBIZZLE", monthlySpendAed: 9000 },
          { portal: "SKYLOOV", monthlySpendAed: 4500 },
        ],
      },
    },
  });

  const signUps = [
    {
      email: "owner@atrium.demo",
      password: "demo1234",
      name: "Sara Al Maktoum",
      role: "owner",
    },
    {
      email: "agent@atrium.demo",
      password: "demo1234",
      name: "Omar Hassan",
      role: "agent",
    },
    {
      email: "manager@atrium.demo",
      password: "demo1234",
      name: "Mina Alami",
      role: "admin",
    },
  ];

  for (const u of signUps) {
    await auth.api.signUpEmail({
      body: {
        email: u.email,
        password: u.password,
        name: u.name,
      },
    });
    await prisma.user.update({
      where: { email: u.email },
      data: { role: u.role, organizationId: org.id, emailVerified: true },
    });
  }

  const agent = await prisma.user.findUniqueOrThrow({
    where: { email: "agent@atrium.demo" },
  });

  const covers = [
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
  ];

  const listingDefs = [
    {
      title: "Marina Vista 2BR",
      community: "Dubai Marina",
      building: "Marina Gate",
      priceAed: 2100000,
      beds: 2,
      baths: 2,
      areaSqft: 1250,
      propertyType: "APARTMENT" as const,
      status: "ACTIVE" as const,
      portals: { BAYUT: "LIVE", PROPERTY_FINDER: "LIVE", DUBIZZLE: "OFF", SKYLOOV: "PENDING" },
    },
    {
      title: "Palm Frond Villa",
      community: "Palm Jumeirah",
      building: "Frond N",
      priceAed: 14500000,
      beds: 5,
      baths: 6,
      areaSqft: 7200,
      propertyType: "VILLA" as const,
      status: "ACTIVE" as const,
      portals: { BAYUT: "LIVE", PROPERTY_FINDER: "PENDING", DUBIZZLE: "OFF", SKYLOOV: "OFF" },
    },
    {
      title: "Downtown Skyline 1BR",
      community: "Downtown Dubai",
      building: "Boulevard Point",
      priceAed: 1750000,
      beds: 1,
      baths: 2,
      areaSqft: 890,
      propertyType: "APARTMENT" as const,
      status: "ACTIVE" as const,
      portals: { BAYUT: "LIVE", PROPERTY_FINDER: "LIVE", DUBIZZLE: "LIVE", SKYLOOV: "OFF" },
    },
    {
      title: "JVC Family Townhouse",
      community: "Jumeirah Village Circle",
      building: "Circle Villas",
      priceAed: 3200000,
      beds: 3,
      baths: 4,
      areaSqft: 2400,
      propertyType: "TOWNHOUSE" as const,
      status: "ACTIVE" as const,
      portals: { BAYUT: "OFF", PROPERTY_FINDER: "LIVE", DUBIZZLE: "OFF", SKYLOOV: "LIVE" },
    },
    {
      title: "Business Bay Office",
      community: "Business Bay",
      building: "Bay Square",
      priceAed: 2800000,
      beds: 0,
      baths: 2,
      areaSqft: 1600,
      propertyType: "OFFICE" as const,
      status: "DRAFT" as const,
      portals: { BAYUT: "OFF", PROPERTY_FINDER: "OFF", DUBIZZLE: "OFF", SKYLOOV: "OFF" },
    },
    {
      title: "Hills Estate 3BR",
      community: "Dubai Hills Estate",
      building: "Park Heights",
      priceAed: 4950000,
      beds: 3,
      baths: 4,
      areaSqft: 2100,
      propertyType: "APARTMENT" as const,
      status: "ACTIVE" as const,
      portals: { BAYUT: "LIVE", PROPERTY_FINDER: "LIVE", DUBIZZLE: "PENDING", SKYLOOV: "OFF" },
    },
  ];

  const listings = [];
  for (let i = 0; i < listingDefs.length; i++) {
    const d = listingDefs[i];
    const listing = await prisma.listing.create({
      data: {
        organizationId: org.id,
        title: d.title,
        description: `${d.beds} bedroom ${d.propertyType.toLowerCase()} in ${d.community}. Ready for viewing.`,
        community: d.community,
        building: d.building,
        priceAed: d.priceAed,
        beds: d.beds,
        baths: d.baths,
        areaSqft: d.areaSqft,
        propertyType: d.propertyType,
        status: d.status,
        coverUrl: covers[i],
        photoUrls: [covers[i]],
        address: `${d.building}, ${d.community}, Dubai`,
        portals: {
          create: (Object.entries(d.portals) as [keyof typeof d.portals, string][]).map(
            ([portal, status]) => ({
              portal: portal as never,
              status: status as never,
              externalId: status === "OFF" ? null : `MOCK-${portal}-${i}`,
            }),
          ),
        },
      },
    });
    listings.push(listing);
  }

  const marina = listings[0];
  const hills = listings[5];

  // Lead that will demonstrate fuse (same phone used twice in demo script)
  const khalid = await prisma.lead.create({
    data: {
      organizationId: org.id,
      name: "Khalid Al Mansoori",
      phone: "+971501112233",
      email: "khalid@example.com",
      primarySource: "BAYUT",
      stage: "QUALIFIED",
      listingId: marina.id,
      assignedToId: agent.id,
      budgetMax: 2300000,
      bedsWanted: 2,
      communities: ["Dubai Marina", "JBR"],
      dealValueAed: 2100000,
      sources: {
        create: {
          source: "BAYUT",
          listingId: marina.id,
          message: "Is this still available?",
        },
      },
      activities: {
        create: [
          { type: "created", body: "Lead captured from Bayut", actorId: agent.id },
          { type: "stage", body: "Stage moved NEW → QUALIFIED", actorId: agent.id },
        ],
      },
      notes: {
        create: {
          authorId: agent.id,
          body: "Prefers marina view, weekend viewing only.",
        },
      },
    },
  });

  await prisma.lead.create({
    data: {
      organizationId: org.id,
      name: "Priya Sharma",
      phone: "+971556667788",
      primarySource: "PROPERTY_FINDER",
      stage: "NEW",
      listingId: hills.id,
      assignedToId: agent.id,
      budgetMax: 5000000,
      bedsWanted: 3,
      communities: ["Dubai Hills Estate"],
      dealValueAed: 4950000,
      sources: {
        create: { source: "PROPERTY_FINDER", listingId: hills.id, message: "Interested in Hills 3BR" },
      },
      activities: {
        create: { type: "created", body: "Lead captured from PropertyFinder", actorId: agent.id },
      },
    },
  });

  await prisma.lead.create({
    data: {
      organizationId: org.id,
      name: "James Whitfield",
      phone: "+971524445566",
      primarySource: "WHATSAPP",
      stage: "VIEWING",
      listingId: listings[1].id,
      assignedToId: agent.id,
      budgetMax: 15000000,
      bedsWanted: 5,
      communities: ["Palm Jumeirah"],
      dealValueAed: 14500000,
      sources: {
        create: { source: "WHATSAPP", listingId: listings[1].id },
      },
      activities: {
        create: { type: "created", body: "Inbound WhatsApp", actorId: agent.id },
      },
    },
  });

  await prisma.lead.create({
    data: {
      organizationId: org.id,
      name: "Fatima Noor",
      phone: "+971501234000",
      primarySource: "DUBIZZLE",
      stage: "OFFER",
      listingId: listings[2].id,
      assignedToId: agent.id,
      budgetMax: 1800000,
      bedsWanted: 1,
      communities: ["Downtown Dubai"],
      dealValueAed: 1750000,
      sources: {
        create: { source: "DUBIZZLE", listingId: listings[2].id },
      },
      activities: {
        create: { type: "created", body: "Lead from Dubizzle", actorId: agent.id },
      },
    },
  });

  await prisma.lead.create({
    data: {
      organizationId: org.id,
      name: "Closed Deal Co.",
      phone: "+971509990001",
      primarySource: "BAYUT",
      stage: "WON",
      listingId: listings[3].id,
      assignedToId: agent.id,
      dealValueAed: 3200000,
      sources: {
        create: [
          { source: "BAYUT", listingId: listings[3].id },
          { source: "PROPERTY_FINDER", listingId: listings[3].id, message: "Fused later" },
        ],
      },
      activities: {
        create: { type: "won", body: "Deal won AED 3.2M", actorId: agent.id },
      },
    },
  });

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(16, 0, 0, 0);

  await prisma.calendarEvent.create({
    data: {
      organizationId: org.id,
      title: `Viewing · ${marina.title}`,
      type: "VIEWING",
      startsAt: tomorrow,
      endsAt: new Date(tomorrow.getTime() + 60 * 60 * 1000),
      leadId: khalid.id,
      listingId: marina.id,
      outcome: "SCHEDULED",
    },
  });

  await prisma.calendarEvent.create({
    data: {
      organizationId: org.id,
      title: `Viewing · ${hills.title}`,
      type: "VIEWING",
      startsAt: yesterday,
      endsAt: new Date(yesterday.getTime() + 60 * 60 * 1000),
      leadId: (await prisma.lead.findFirst({ where: { name: "Priya Sharma" } }))!.id,
      listingId: hills.id,
      outcome: "COMPLETED",
      feedbackFit: "good",
      feedback: "Liked the park view; wants similar under 5M.",
    },
  });

  await prisma.calendarEvent.create({
    data: {
      organizationId: org.id,
      title: "Follow-up call · James Whitfield",
      type: "CALL",
      startsAt: yesterday,
      leadId: (await prisma.lead.findFirst({ where: { name: "James Whitfield" } }))!.id,
      listingId: listings[1].id,
      outcome: "SCHEDULED",
    },
  });

  const shortlist = await prisma.shortlist.create({
    data: {
      organizationId: org.id,
      title: "Marina options for Khalid",
      clientName: "Khalid Al Mansoori",
      items: {
        create: [
          { listingId: marina.id, sortOrder: 0 },
          { listingId: listings[2].id, sortOrder: 1 },
          { listingId: hills.id, sortOrder: 2 },
        ],
      },
    },
  });

  console.log("Seed complete.");
  console.log("Login: agent@atrium.demo / demo1234");
  console.log(`Shortlist token: ${shortlist.token}`);
  console.log(`Public URL: http://localhost:3000/s/${shortlist.token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
