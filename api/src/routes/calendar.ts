import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const calendarRouter = Router();
calendarRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

function userId(req: AuthedRequest) {
  return req.session?.user.id;
}

calendarRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;

  const events = await prisma.calendarEvent.findMany({
    where: {
      organizationId,
      ...(from || to
        ? {
            startsAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: {
      lead: { select: { id: true, name: true, phone: true } },
      listing: { select: { id: true, title: true, community: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  res.json(events);
});

calendarRouter.post("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    title: z.string().min(1),
    type: z.enum(["VIEWING", "CALL", "FOLLOW_UP", "TASK"]).default("FOLLOW_UP"),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional().nullable(),
    leadId: z.string().optional().nullable(),
    listingId: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const event = await prisma.calendarEvent.create({
    data: {
      organizationId,
      title: parsed.data.title,
      type: parsed.data.type,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt ?? null,
      leadId: parsed.data.leadId || null,
      listingId: parsed.data.listingId || null,
      outcome: parsed.data.type === "VIEWING" ? "SCHEDULED" : null,
    },
    include: { lead: true, listing: true },
  });

  if (parsed.data.leadId) {
    await prisma.activityEvent.create({
      data: {
        leadId: parsed.data.leadId,
        actorId: userId(req),
        type: "calendar",
        body: `Scheduled ${parsed.data.type.toLowerCase()}: ${parsed.data.title}`,
      },
    });
    if (parsed.data.type === "VIEWING") {
      await prisma.lead.update({
        where: { id: parsed.data.leadId },
        data: { stage: "VIEWING" },
      });
    }
  }

  res.status(201).json(event);
});

calendarRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: String(req.params.id), organizationId: organizationId ?? undefined },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const schema = z.object({
    title: z.string().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional().nullable(),
    outcome: z.enum(["SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"]).optional(),
    feedback: z.string().optional().nullable(),
    feedbackFit: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const event = await prisma.calendarEvent.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endsAt:
        parsed.data.endsAt === undefined
          ? undefined
          : parsed.data.endsAt
            ? new Date(parsed.data.endsAt)
            : null,
    },
    include: { lead: true, listing: true },
  });

  if (parsed.data.outcome && existing.leadId) {
    await prisma.activityEvent.create({
      data: {
        leadId: existing.leadId,
        actorId: userId(req),
        type: "viewing_outcome",
        body: `Viewing ${parsed.data.outcome}${parsed.data.feedbackFit ? ` · fit: ${parsed.data.feedbackFit}` : ""}${parsed.data.feedback ? ` - ${parsed.data.feedback}` : ""}`,
      },
    });
  }

  res.json(event);
});

calendarRouter.get("/overdue", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const now = new Date();
  const overdue = await prisma.calendarEvent.findMany({
    where: {
      organizationId,
      startsAt: { lt: now },
      OR: [{ outcome: "SCHEDULED" }, { outcome: null }],
    },
    include: {
      lead: { select: { id: true, name: true, dealValueAed: true } },
      listing: { select: { title: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  res.json(overdue);
});
