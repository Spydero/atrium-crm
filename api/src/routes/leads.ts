import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const leadsRouter = Router();
leadsRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

function userId(req: AuthedRequest) {
  return req.session?.user.id;
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

/** Simulate inbound portal lead — registered before /:id */
leadsRouter.post("/simulate", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    name: z.string().min(1),
    phone: z.string().min(5),
    source: z.enum(["BAYUT", "PROPERTY_FINDER", "DUBIZZLE", "SKYLOOV"]),
    listingId: z.string().optional(),
    email: z.string().optional(),
    budgetMax: z.number().optional(),
    bedsWanted: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const phone = normalizePhone(parsed.data.phone);
  const source = parsed.data.source;
  const existing = await prisma.lead.findFirst({
    where: { organizationId, phone },
  });

  if (existing) {
    await prisma.leadSourceEvent.create({
      data: {
        leadId: existing.id,
        source,
        listingId: parsed.data.listingId ?? existing.listingId,
        message: `Simulated portal enquiry from ${source}`,
      },
    });
    await prisma.activityEvent.create({
      data: {
        leadId: existing.id,
        actorId: userId(req),
        type: "fuse",
        body: `Lead Fuse: ${source} enquiry merged (same phone ${phone}).`,
      },
    });
    const fused = await prisma.lead.findUnique({
      where: { id: existing.id },
      include: {
        listing: true,
        sources: { orderBy: { createdAt: "desc" } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
    return res.json({ fused: true, lead: fused });
  }

  const listing = parsed.data.listingId
    ? await prisma.listing.findFirst({
        where: { id: parsed.data.listingId, organizationId },
      })
    : null;

  const lead = await prisma.lead.create({
    data: {
      organizationId,
      name: parsed.data.name,
      phone,
      email: parsed.data.email ?? null,
      primarySource: source,
      listingId: listing?.id ?? null,
      budgetMax: parsed.data.budgetMax ?? listing?.priceAed ?? null,
      bedsWanted: parsed.data.bedsWanted ?? listing?.beds ?? null,
      communities: listing ? [listing.community] : [],
      dealValueAed: parsed.data.budgetMax ?? listing?.priceAed ?? null,
      assignedToId: userId(req) ?? null,
      sources: {
        create: {
          source,
          listingId: listing?.id ?? null,
          message: `Simulated ${source} lead`,
        },
      },
      activities: {
        create: {
          actorId: userId(req),
          type: "created",
          body: `Lead captured from ${source}`,
        },
      },
    },
    include: {
      listing: true,
      sources: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });

  res.status(201).json({ fused: false, lead });
});

leadsRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const leads = await prisma.lead.findMany({
    where: { organizationId },
    include: {
      listing: true,
      assignedTo: { select: { id: true, name: true, image: true } },
      sources: { orderBy: { createdAt: "desc" } },
      events: { where: { outcome: "SCHEDULED" }, take: 1, orderBy: { startsAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json(leads);
});

leadsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, organizationId: organizationId ?? undefined },
    include: {
      listing: true,
      assignedTo: { select: { id: true, name: true } },
      sources: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
      events: { orderBy: { startsAt: "desc" } },
    },
  });
  if (!lead) return res.status(404).json({ error: "Not found" });
  res.json(lead);
});

leadsRouter.post("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    name: z.string().min(1),
    phone: z.string().min(5),
    email: z.string().email().optional().nullable(),
    primarySource: z
      .enum([
        "MANUAL",
        "BAYUT",
        "PROPERTY_FINDER",
        "DUBIZZLE",
        "SKYLOOV",
        "WHATSAPP",
        "META",
        "REFERRAL",
        "WEBSITE",
      ])
      .optional(),
    listingId: z.string().optional().nullable(),
    budgetMin: z.number().optional().nullable(),
    budgetMax: z.number().optional().nullable(),
    bedsWanted: z.number().optional().nullable(),
    communities: z.array(z.string()).optional(),
    dealValueAed: z.number().optional().nullable(),
    assignedToId: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const phone = normalizePhone(parsed.data.phone);
  const source = parsed.data.primarySource ?? "MANUAL";

  // Lead Fuse: same phone in org → attach source event, don't create duplicate
  const existing = await prisma.lead.findFirst({
    where: { organizationId, phone },
    include: { sources: true },
  });

  if (existing) {
    await prisma.leadSourceEvent.create({
      data: {
        leadId: existing.id,
        source,
        listingId: parsed.data.listingId ?? existing.listingId,
        message: `Fused enquiry from ${source}`,
      },
    });
    await prisma.activityEvent.create({
      data: {
        leadId: existing.id,
        actorId: userId(req),
        type: "fuse",
        body: `Lead Fuse: new ${source} enquiry merged into existing lead (same phone).`,
      },
    });
    if (parsed.data.listingId && !existing.listingId) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: { listingId: parsed.data.listingId },
      });
    }
    const fused = await prisma.lead.findUnique({
      where: { id: existing.id },
      include: {
        listing: true,
        sources: { orderBy: { createdAt: "desc" } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
    return res.status(200).json({ fused: true, lead: fused });
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId,
      name: parsed.data.name,
      phone,
      email: parsed.data.email ?? null,
      primarySource: source,
      listingId: parsed.data.listingId ?? null,
      budgetMin: parsed.data.budgetMin ?? null,
      budgetMax: parsed.data.budgetMax ?? null,
      bedsWanted: parsed.data.bedsWanted ?? null,
      communities: parsed.data.communities ?? [],
      dealValueAed: parsed.data.dealValueAed ?? null,
      assignedToId: parsed.data.assignedToId ?? userId(req) ?? null,
      sources: {
        create: {
          source,
          listingId: parsed.data.listingId ?? null,
          message: "Initial enquiry",
        },
      },
      activities: {
        create: {
          actorId: userId(req),
          type: "created",
          body: `Lead created from ${source}`,
        },
      },
    },
    include: {
      listing: true,
      sources: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });

  res.status(201).json({ fused: false, lead });
});

leadsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  const existing = await prisma.lead.findFirst({
    where: { id: req.params.id, organizationId: organizationId ?? undefined },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const schema = z.object({
    stage: z.enum(["NEW", "QUALIFIED", "VIEWING", "OFFER", "WON", "LOST"]).optional(),
    name: z.string().optional(),
    email: z.string().optional().nullable(),
    listingId: z.string().optional().nullable(),
    assignedToId: z.string().optional().nullable(),
    budgetMin: z.number().optional().nullable(),
    budgetMax: z.number().optional().nullable(),
    bedsWanted: z.number().optional().nullable(),
    communities: z.array(z.string()).optional(),
    dealValueAed: z.number().optional().nullable(),
    notesSummary: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const lead = await prisma.lead.update({
    where: { id: existing.id },
    data: parsed.data,
    include: {
      listing: true,
      sources: { orderBy: { createdAt: "desc" } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  if (parsed.data.stage && parsed.data.stage !== existing.stage) {
    await prisma.activityEvent.create({
      data: {
        leadId: lead.id,
        actorId: userId(req),
        type: "stage",
        body: `Stage moved ${existing.stage} → ${parsed.data.stage}`,
      },
    });
  }

  res.json(lead);
});

leadsRouter.post("/:id/notes", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  const existing = await prisma.lead.findFirst({
    where: { id: req.params.id, organizationId: organizationId ?? undefined },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const body = z.object({ body: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());

  const note = await prisma.leadNote.create({
    data: {
      leadId: existing.id,
      authorId: userId(req),
      body: body.data.body,
    },
  });
  await prisma.activityEvent.create({
    data: {
      leadId: existing.id,
      actorId: userId(req),
      type: "note",
      body: "Note added",
    },
  });
  res.status(201).json(note);
});

/** Smart Match: rule-based listing suggestions for a lead */
leadsRouter.get("/:id/match", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, organizationId: organizationId ?? undefined },
  });
  if (!lead) return res.status(404).json({ error: "Not found" });

  const listings = await prisma.listing.findMany({
    where: {
      organizationId: organizationId!,
      status: { in: ["ACTIVE", "RESERVED"] },
      ...(lead.bedsWanted ? { beds: { gte: lead.bedsWanted } } : {}),
      ...(lead.budgetMax ? { priceAed: { lte: Math.round(lead.budgetMax * 1.1) } } : {}),
      ...(lead.communities.length
        ? { community: { in: lead.communities } }
        : {}),
    },
    include: { portals: true },
    take: 20,
  });

  const scored = listings
    .map((l) => {
      let score = 50;
      if (lead.bedsWanted != null && l.beds === lead.bedsWanted) score += 20;
      if (lead.budgetMax && l.priceAed <= lead.budgetMax) score += 15;
      if (lead.communities.includes(l.community)) score += 25;
      if (l.portals.some((p) => p.status === "LIVE")) score += 5;
      return { listing: l, score };
    })
    .sort((a, b) => b.score - a.score);

  res.json(scored);
});
