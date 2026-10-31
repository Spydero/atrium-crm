import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import {
  allowsNoShow,
  cancelReasonLabel,
  outcomeLabel,
  typeLabel,
} from "../lib/eventOutcome.js";

export const calendarRouter = Router();
calendarRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

function userId(req: AuthedRequest) {
  return req.session?.user.id;
}

const TYPES = ["VIEWING", "CALL", "FOLLOW_UP", "TASK"] as const;
const OUTCOMES = ["SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"] as const;
const CANCEL_REASONS = [
  "CLIENT",
  "AGENT",
  "LANDLORD",
  "LISTING_UNAVAILABLE",
  "RESCHEDULED",
  "DUPLICATE",
  "OTHER",
] as const;

const includeEvent = {
  lead: { select: { id: true, name: true, phone: true } },
  listing: { select: { id: true, title: true, community: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

function fmtWhen(d: Date) {
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

calendarRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const leadId = typeof req.query.leadId === "string" ? req.query.leadId : undefined;

  const events = await prisma.calendarEvent.findMany({
    where: {
      organizationId,
      ...(leadId ? { leadId } : {}),
      ...(from || to
        ? {
            startsAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: includeEvent,
    orderBy: { startsAt: "asc" },
  });
  res.json(events);
});

calendarRouter.post("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    title: z.string().min(1),
    type: z.enum(TYPES).default("FOLLOW_UP"),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional().nullable(),
    leadId: z.string().optional().nullable(),
    listingId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  if (parsed.data.endsAt && parsed.data.endsAt < parsed.data.startsAt) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  if (parsed.data.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: parsed.data.leadId, organizationId },
      select: { id: true },
    });
    if (!lead) return res.status(400).json({ error: "Lead not found in your organization" });
  }
  if (parsed.data.listingId) {
    const listing = await prisma.listing.findFirst({
      where: { id: parsed.data.listingId, organizationId },
      select: { id: true },
    });
    if (!listing) return res.status(400).json({ error: "Listing not found in your organization" });
  }

  const event = await prisma.calendarEvent.create({
    data: {
      organizationId,
      title: parsed.data.title,
      type: parsed.data.type,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt ?? null,
      leadId: parsed.data.leadId || null,
      listingId: parsed.data.listingId || null,
      notes: parsed.data.notes?.trim() || null,
      outcome: "SCHEDULED",
      createdById: userId(req) ?? null,
    },
    include: includeEvent,
  });

  if (parsed.data.leadId) {
    await prisma.activityEvent.create({
      data: {
        leadId: parsed.data.leadId,
        actorId: userId(req),
        type: "calendar",
        body: `Scheduled ${typeLabel(parsed.data.type).toLowerCase()}: ${parsed.data.title}`,
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
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: String(req.params.id), organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const schema = z.object({
    title: z.string().min(1).optional(),
    type: z.enum(TYPES).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional().nullable(),
    leadId: z.string().optional().nullable(),
    listingId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    outcome: z.enum(OUTCOMES).optional(),
    cancelReason: z.enum(CANCEL_REASONS).optional().nullable(),
    feedback: z.string().optional().nullable(),
    feedbackFit: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const data = parsed.data;

  const nextType = data.type ?? existing.type;
  const nextOutcome = data.outcome ?? existing.outcome;

  if (data.type && data.type !== existing.type && existing.outcome !== "SCHEDULED") {
    return res.status(400).json({ error: "Change the type only while the event is still open" });
  }
  if (nextOutcome === "NO_SHOW" && !allowsNoShow(nextType)) {
    return res.status(400).json({ error: "No-show is only for viewings and calls" });
  }
  if (nextOutcome === "CANCELLED") {
    const reason = data.cancelReason !== undefined ? data.cancelReason : existing.cancelReason;
    if (!reason) return res.status(400).json({ error: "Pick a cancel reason" });
  }
  if (data.endsAt && data.startsAt && data.endsAt < data.startsAt) {
    return res.status(400).json({ error: "End time must be after start time" });
  }
  if (data.endsAt && !data.startsAt && data.endsAt < existing.startsAt) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  if (data.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: data.leadId, organizationId },
      select: { id: true },
    });
    if (!lead) return res.status(400).json({ error: "Lead not found in your organization" });
  }
  if (data.listingId) {
    const listing = await prisma.listing.findFirst({
      where: { id: data.listingId, organizationId },
      select: { id: true },
    });
    if (!listing) return res.status(400).json({ error: "Listing not found in your organization" });
  }

  const outcomeChanging = data.outcome != null && data.outcome !== existing.outcome;
  const reopening = outcomeChanging && data.outcome === "SCHEDULED";
  const closing = outcomeChanging && data.outcome !== "SCHEDULED";

  const event = await prisma.calendarEvent.update({
    where: { id: existing.id },
    data: {
      ...(data.title != null ? { title: data.title } : {}),
      ...(data.type != null ? { type: data.type } : {}),
      ...(data.startsAt != null ? { startsAt: data.startsAt } : {}),
      ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
      ...(data.leadId !== undefined ? { leadId: data.leadId || null } : {}),
      ...(data.listingId !== undefined ? { listingId: data.listingId || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(data.outcome != null ? { outcome: data.outcome } : {}),
      ...(data.feedback !== undefined ? { feedback: data.feedback?.trim() || null } : {}),
      ...(data.feedbackFit !== undefined
        ? { feedbackFit: nextType === "VIEWING" ? data.feedbackFit : null }
        : data.type && data.type !== "VIEWING"
          ? { feedbackFit: null }
          : {}),
      ...(reopening
        ? { outcomeAt: null, cancelReason: null, feedback: null, feedbackFit: null }
        : {}),
      ...(closing ? { outcomeAt: new Date() } : {}),
      ...(nextOutcome === "CANCELLED"
        ? {
            cancelReason:
              data.cancelReason !== undefined ? data.cancelReason : existing.cancelReason,
          }
        : data.outcome && data.outcome !== "CANCELLED"
          ? { cancelReason: null }
          : data.cancelReason !== undefined
            ? { cancelReason: data.cancelReason }
            : {}),
    },
    include: includeEvent,
  });

  const leadForActivity = event.leadId ?? existing.leadId;
  if (leadForActivity && data.startsAt && data.startsAt.getTime() !== existing.startsAt.getTime()) {
    await prisma.activityEvent.create({
      data: {
        leadId: leadForActivity,
        actorId: userId(req),
        type: "calendar_rescheduled",
        body: `Rescheduled ${typeLabel(event.type).toLowerCase()} from ${fmtWhen(existing.startsAt)} to ${fmtWhen(event.startsAt)}`,
      },
    });
  }

  if (leadForActivity && outcomeChanging && data.outcome) {
    const reason =
      data.outcome === "CANCELLED" && event.cancelReason
        ? ` (${cancelReasonLabel(event.cancelReason)})`
        : "";
    const note = event.feedback ? ` - ${event.feedback}` : "";
    await prisma.activityEvent.create({
      data: {
        leadId: leadForActivity,
        actorId: userId(req),
        type: "viewing_outcome",
        body: `${typeLabel(event.type)} - ${outcomeLabel(event.type, data.outcome)}${reason}${note}`,
      },
    });
  }

  res.json(event);
});

calendarRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: String(req.params.id), organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (existing.leadId) {
    await prisma.activityEvent.create({
      data: {
        leadId: existing.leadId,
        actorId: userId(req),
        type: "calendar_deleted",
        body: `Deleted ${typeLabel(existing.type).toLowerCase()}: ${existing.title} (was ${fmtWhen(existing.startsAt)})`,
      },
    });
  }

  await prisma.calendarEvent.delete({ where: { id: existing.id } });
  res.status(204).end();
});

calendarRouter.get("/overdue", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const now = new Date();
  const overdue = await prisma.calendarEvent.findMany({
    where: {
      organizationId,
      startsAt: { lt: now },
      outcome: "SCHEDULED",
    },
    include: {
      lead: { select: { id: true, name: true, dealValueAed: true } },
      listing: { select: { title: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  res.json(overdue);
});
