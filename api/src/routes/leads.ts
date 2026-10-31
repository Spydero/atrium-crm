import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { csvFilename, labelize, toCsv } from "../lib/csv.js";
import { groupDuplicates, mergeLeadFields, mergedFromNote, suggestPrimary } from "../lib/leadTools.js";
import { assertChannelEnabled, normalizeChannelKey } from "../lib/channels.js";

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

/** Log an inbound enquiry on an enabled org channel (replaces portal "simulate"). */
leadsRouter.post("/enquiries", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    name: z.string().min(1),
    phone: z.string().min(5),
    source: z.string().min(1).max(40),
    listingId: z.string().optional(),
    email: z.string().optional(),
    budgetMax: z.number().optional(),
    bedsWanted: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  let channel;
  try {
    channel = await assertChannelEnabled(organizationId, parsed.data.source);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return res.status(err.status || 400).json({ error: err.message || "Invalid channel" });
  }
  const source = channel.key;
  const phone = normalizePhone(parsed.data.phone);
  const existing = await prisma.lead.findFirst({
    where: { organizationId, phone },
  });

  if (existing) {
    await prisma.leadSourceEvent.create({
      data: {
        leadId: existing.id,
        source,
        listingId: parsed.data.listingId ?? existing.listingId,
        message: `Enquiry via ${channel.label}`,
      },
    });
    await prisma.activityEvent.create({
      data: {
        leadId: existing.id,
        actorId: userId(req),
        type: "fuse",
        body: `Lead Fuse: ${channel.label} enquiry merged (same phone ${phone}).`,
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
          message: `Enquiry via ${channel.label}`,
        },
      },
      activities: {
        create: {
          actorId: userId(req),
          type: "created",
          body: `Lead captured from ${channel.label}`,
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

// ---------------------------------------------------------------------------
// Bulk actions + duplicate merge. All registered before /:id routes.
// ---------------------------------------------------------------------------

const STAGE_ENUM = z.enum(["NEW", "QUALIFIED", "VIEWING", "OFFER", "WON", "LOST"]);

const summaryInclude = {
  listing: { select: { id: true, title: true } },
  assignedTo: { select: { id: true, name: true } },
  sources: { select: { source: true } },
  _count: { select: { sources: true, notes: true, events: true, activities: true } },
} as const;

type SummaryRow = Awaited<ReturnType<typeof loadSummaries>>[number];

async function loadSummaries(organizationId: string, ids?: string[]) {
  const rows = await prisma.lead.findMany({
    where: { organizationId, ...(ids ? { id: { in: ids } } : {}) },
    include: summaryInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email,
    stage: l.stage,
    primarySource: l.primarySource,
    sources: [...new Set(l.sources.map((s) => s.source))],
    sourcesCount: l._count.sources,
    notesCount: l._count.notes,
    eventsCount: l._count.events,
    activitiesCount: l._count.activities,
    listing: l.listing,
    assignedTo: l.assignedTo,
    budgetMin: l.budgetMin,
    budgetMax: l.budgetMax,
    bedsWanted: l.bedsWanted,
    dealValueAed: l.dealValueAed,
    createdAt: l.createdAt,
  }));
}

/** Team members the org can assign leads to. */
leadsRouter.get("/agents", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

/** Groups of leads that look like the same person (shared phone or email). */
leadsRouter.get("/duplicates", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const all = await loadSummaries(organizationId);
  const groups = groupDuplicates<SummaryRow>(all).map((g, i) => ({
    key: `${i}-${g.suggestedPrimaryId}`,
    reasons: g.reasons,
    suggestedPrimaryId: g.suggestedPrimaryId,
    leads: g.leads,
  }));
  res.json({ count: groups.length, leadCount: groups.reduce((s, g) => s + g.leads.length, 0), groups });
});

/** Side-by-side data for a manual merge of selected leads. */
leadsRouter.get("/compare", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const ids = String(req.query.ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = [...new Set(ids)];
  if (unique.length < 2 || unique.length > 10) {
    return res.status(400).json({ error: "Select between 2 and 10 leads to compare" });
  }
  const leads = await loadSummaries(organizationId, unique);
  if (leads.length !== unique.length) {
    return res.status(404).json({ error: "One or more leads were not found" });
  }
  res.json({ suggestedPrimaryId: suggestPrimary(leads).id, leads });
});

/** Change stage or owner for many leads at once. */
leadsRouter.post("/bulk", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("stage"), ids: z.array(z.string()).min(1).max(200), stage: STAGE_ENUM }),
    z.object({ action: z.literal("assign"), ids: z.array(z.string()).min(1).max(200), assignedToId: z.string().min(1) }),
    z.object({ action: z.literal("unassign"), ids: z.array(z.string()).min(1).max(200) }),
  ]);
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const body = parsed.data;

  const ids = [...new Set(body.ids)];
  const leads = await prisma.lead.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, stage: true, assignedToId: true, assignedTo: { select: { name: true } } },
  });
  if (leads.length !== ids.length) {
    return res.status(404).json({ error: "One or more leads were not found" });
  }
  const actorId = userId(req) ?? null;

  if (body.action === "stage") {
    const changed = leads.filter((l) => l.stage !== body.stage);
    if (changed.length) {
      await prisma.$transaction([
        prisma.lead.updateMany({
          where: { id: { in: changed.map((l) => l.id) }, organizationId },
          data: {
            stage: body.stage,
            wonAt: body.stage === "WON" ? new Date() : null,
          },
        }),
        prisma.activityEvent.createMany({
          data: changed.map((l) => ({
            leadId: l.id,
            actorId,
            type: "stage",
            body: `Stage moved ${l.stage} → ${body.stage} (bulk)`,
          })),
        }),
      ]);
    }
    return res.json({ action: "stage", updated: changed.length, unchanged: leads.length - changed.length });
  }

  let target: { id: string; name: string } | null = null;
  if (body.action === "assign") {
    target = await prisma.user.findFirst({
      where: { id: body.assignedToId, organizationId },
      select: { id: true, name: true },
    });
    if (!target) return res.status(400).json({ error: "That agent is not in your organization" });
  }
  const targetId = target?.id ?? null;
  const changed = leads.filter((l) => l.assignedToId !== targetId);
  if (changed.length) {
    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { id: { in: changed.map((l) => l.id) }, organizationId },
        data: { assignedToId: targetId },
      }),
      prisma.activityEvent.createMany({
        data: changed.map((l) => ({
          leadId: l.id,
          actorId,
          type: "assigned",
          body: target
            ? `Assigned to ${target.name}${l.assignedTo ? ` (was ${l.assignedTo.name})` : ""} (bulk)`
            : `Unassigned${l.assignedTo ? ` (was ${l.assignedTo.name})` : ""} (bulk)`,
        })),
      }),
    ]);
  }
  res.json({
    action: body.action,
    updated: changed.length,
    unchanged: leads.length - changed.length,
    assignedTo: target,
  });
});

/** Merge duplicate leads into one. Keeps the primary, moves all history across. */
leadsRouter.post("/merge", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const parsed = z
    .object({
      primaryId: z.string().min(1),
      duplicateIds: z.array(z.string()).min(1).max(9),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const dupIds = [...new Set(parsed.data.duplicateIds)].filter((id) => id !== parsed.data.primaryId);
  if (!dupIds.length) return res.status(400).json({ error: "Pick at least one other lead to merge" });
  const allIds = [parsed.data.primaryId, ...dupIds];

  const found = await prisma.lead.findMany({ where: { id: { in: allIds }, organizationId } });
  if (found.length !== allIds.length) {
    return res.status(404).json({ error: "One or more leads were not found" });
  }
  const primary = found.find((l) => l.id === parsed.data.primaryId)!;
  const dups = dupIds.map((id) => found.find((l) => l.id === id)!);
  const actorId = userId(req) ?? null;
  const fields = mergeLeadFields(primary, dups);

  const result = await prisma.$transaction(async (tx) => {
    const where = { leadId: { in: dupIds } };
    await tx.guideRequest.updateMany({ where, data: { leadId: primary.id } });
    const [sources, notes, activities, events] = await Promise.all([
      tx.leadSourceEvent.updateMany({ where, data: { leadId: primary.id } }),
      tx.leadNote.updateMany({ where, data: { leadId: primary.id } }),
      tx.activityEvent.updateMany({ where, data: { leadId: primary.id } }),
      tx.calendarEvent.updateMany({ where, data: { leadId: primary.id } }),
    ]);

    await tx.lead.deleteMany({ where: { id: { in: dupIds }, organizationId } });
    await tx.lead.update({ where: { id: primary.id }, data: fields });

    for (const d of dups) {
      const text = mergedFromNote(primary, d);
      await tx.leadNote.create({ data: { leadId: primary.id, authorId: actorId, body: text } });
      await tx.activityEvent.create({
        data: {
          leadId: primary.id,
          actorId,
          type: "merge",
          body: `Merged duplicate "${d.name}" (${d.phone || d.email || "no contact"}) into this lead`,
        },
      });
    }
    return {
      sources: sources.count,
      notes: notes.count,
      activities: activities.count,
      events: events.count,
    };
  });

  const lead = await prisma.lead.findUnique({
    where: { id: primary.id },
    include: {
      listing: true,
      assignedTo: { select: { id: true, name: true } },
      sources: { orderBy: { createdAt: "desc" } },
    },
  });
  res.json({ merged: dupIds.length, moved: result, lead });
});

/** CSV export - registered before /:id */
leadsRouter.get("/export.csv", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const stage = typeof req.query.stage === "string" ? req.query.stage : undefined;
  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      ...(stage && stage !== "ALL"
        ? { stage: stage as "NEW" | "QUALIFIED" | "VIEWING" | "OFFER" | "WON" | "LOST" }
        : {}),
    },
    include: {
      listing: { select: { title: true } },
      assignedTo: { select: { name: true } },
      sources: { select: { source: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = leads.map((l) => [
    l.name,
    l.phone,
    l.email,
    labelize(l.stage),
    labelize(l.primarySource),
    [...new Set(l.sources.map((s) => labelize(s.source)))].join("; "),
    l.listing?.title,
    l.assignedTo?.name,
    l.budgetMin,
    l.budgetMax,
    l.bedsWanted,
    l.communities.join("; "),
    l.dealValueAed,
    l.notesSummary,
    l.createdAt,
    l.updatedAt,
  ]);
  const csv = toCsv(
    [
      "Name",
      "Phone",
      "Email",
      "Stage",
      "Primary source",
      "All sources",
      "Listing",
      "Assigned to",
      "Budget min",
      "Budget max",
      "Beds wanted",
      "Communities",
      "Deal value",
      "Notes",
      "Created",
      "Updated",
    ],
    rows,
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${csvFilename("leads")}"`);
  res.send(csv);
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
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const lead = await prisma.lead.findFirst({
    where: { id: String(req.params.id), organizationId },
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
    primarySource: z.string().min(1).max(40).optional(),
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
  let source = normalizeChannelKey(parsed.data.primarySource ?? "manual");
  try {
    source = (await assertChannelEnabled(organizationId, source)).key;
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return res.status(err.status || 400).json({ error: err.message || "Invalid channel" });
  }

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
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const existing = await prisma.lead.findFirst({
    where: { id: String(req.params.id), organizationId },
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

  const stageChanged = parsed.data.stage && parsed.data.stage !== existing.stage;
  const wonPatch =
    stageChanged && parsed.data.stage === "WON"
      ? { wonAt: existing.wonAt ?? new Date() }
      : stageChanged && parsed.data.stage !== "WON"
        ? { wonAt: null }
        : {};

  const lead = await prisma.lead.update({
    where: { id: existing.id },
    data: { ...parsed.data, ...wonPatch },
    include: {
      listing: true,
      sources: { orderBy: { createdAt: "desc" } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  if (stageChanged) {
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
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const existing = await prisma.lead.findFirst({
    where: { id: String(req.params.id), organizationId },
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
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const lead = await prisma.lead.findFirst({
    where: { id: String(req.params.id), organizationId },
  });
  if (!lead) return res.status(404).json({ error: "Not found" });

  const listings = await prisma.listing.findMany({
    where: {
      organizationId,
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
