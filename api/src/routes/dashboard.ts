import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

const STAGES = ["NEW", "QUALIFIED", "VIEWING", "OFFER", "WON", "LOST"] as const;

dashboardRouter.get("/kpis", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const now = new Date();
  const localKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  // Match chart window: start of (today − 6 days) through now
  const weekAgo = new Date(now);
  weekAgo.setHours(0, 0, 0, 0);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 7);

  const [
    openLeads,
    pipeline,
    viewingsWeek,
    won,
    lost,
    listingsActive,
    listingsDraft,
    leads,
    stageGroups,
    sourceEvents,
    upcomingViewings,
    overdueViewings,
  ] = await Promise.all([
    prisma.lead.count({
      where: { organizationId, stage: { notIn: ["WON", "LOST"] } },
    }),
    prisma.lead.aggregate({
      where: { organizationId, stage: { notIn: ["LOST"] } },
      _sum: { dealValueAed: true },
    }),
    prisma.calendarEvent.count({
      where: {
        organizationId,
        type: "VIEWING",
        startsAt: { gte: weekAgo, lte: weekAhead },
      },
    }),
    prisma.lead.count({ where: { organizationId, stage: "WON" } }),
    prisma.lead.count({ where: { organizationId, stage: "LOST" } }),
    prisma.listing.count({
      where: { organizationId, status: "ACTIVE" },
    }),
    prisma.listing.count({
      where: { organizationId, status: "DRAFT" },
    }),
    prisma.lead.findMany({
      where: { organizationId, createdAt: { gte: weekAgo } },
      select: { createdAt: true },
    }),
    prisma.lead.groupBy({
      by: ["stage"],
      where: { organizationId },
      _count: { _all: true },
      _sum: { dealValueAed: true },
    }),
    prisma.leadSourceEvent.findMany({
      where: { lead: { organizationId } },
      select: { source: true, leadId: true },
    }),
    prisma.calendarEvent.findMany({
      where: {
        organizationId,
        type: "VIEWING",
        startsAt: { gte: now, lte: weekAhead },
      },
      include: {
        lead: { select: { id: true, name: true } },
        listing: { select: { id: true, title: true, community: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    prisma.calendarEvent.findMany({
      where: {
        organizationId,
        type: "VIEWING",
        startsAt: { lt: now },
        OR: [{ outcome: "SCHEDULED" }, { outcome: null }],
      },
      include: {
        lead: { select: { id: true, name: true, dealValueAed: true } },
        listing: { select: { title: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 5,
    }),
  ]);

  const closed = won + lost;
  const closeRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
  const winRateOpen =
    openLeads + won > 0 ? Math.round((won / (openLeads + won)) * 100) : 0;

  // Rolling last 7 calendar days (oldest → newest) with real date labels
  const chart: { day: string; label: string; count: number; date: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    chart.push({
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      label: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
      count: 0,
      date: localKey(d),
    });
  }
  for (const l of leads) {
    const created = new Date(l.createdAt);
    const row = chart.find((c) => c.date === localKey(created));
    if (row) row.count += 1;
  }

  const peak = chart.reduce(
    (best, row) => (row.count > best.count ? row : best),
    chart[0],
  );

  const pipelineByStage = STAGES.filter((s) => s !== "LOST").map((stage) => {
    const row = stageGroups.find((g) => g.stage === stage);
    return {
      stage,
      count: row?._count._all ?? 0,
      valueAed: row?._sum.dealValueAed ?? 0,
    };
  });

  const bySource = new Map<string, Set<string>>();
  for (const e of sourceEvents) {
    if (!bySource.has(e.source)) bySource.set(e.source, new Set());
    bySource.get(e.source)!.add(e.leadId);
  }
  const sourceMix = [...bySource.entries()]
    .map(([source, set]) => ({ source, count: set.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const atRiskAed = overdueViewings.reduce(
    (sum, v) => sum + (v.lead?.dealValueAed ?? 0),
    0,
  );

  res.json({
    openLeads,
    pipelineAed: pipeline._sum.dealValueAed ?? 0,
    viewingsWeek,
    closeRate,
    winRateOpen,
    won,
    lost,
    listingsActive,
    listingsDraft,
    newLeadsChart: chart,
    newLeadsWeek: leads.length,
    peakDay: peak ? { label: peak.label, count: peak.count } : null,
    pipelineByStage,
    sourceMix,
    upcomingViewings: upcomingViewings.map((v) => ({
      id: v.id,
      title: v.title,
      startsAt: v.startsAt,
      leadName: v.lead?.name ?? null,
      leadId: v.lead?.id ?? null,
      listingTitle: v.listing?.title ?? null,
      community: v.listing?.community ?? null,
    })),
    attention: {
      overdueViewings: overdueViewings.length,
      atRiskAed,
      draftListings: listingsDraft,
      items: overdueViewings.map((v) => ({
        id: v.id,
        label: v.lead?.name || v.title,
        detail: v.listing?.title || "Viewing overdue",
        valueAed: v.lead?.dealValueAed ?? 0,
        startsAt: v.startsAt,
      })),
    },
  });
});
