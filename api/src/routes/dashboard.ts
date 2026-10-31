import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import {
  buildChartBuckets,
  resolveDateRange,
  startOfDay,
  endOfDay,
} from "../lib/dateRange.js";
import {
  allowedGroups,
  buildTrend,
  pickGroup,
  summarize,
  totalOf,
  type TrendItem,
  type TrendMetric,
} from "../lib/trendBuckets.js";
import { viewingTrendItems } from "../lib/viewingStats.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

const STAGES = ["NEW", "QUALIFIED", "VIEWING", "OFFER", "WON", "LOST"] as const;

dashboardRouter.get("/kpis", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const range = resolveDateRange(req.query);
  const now = new Date();
  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 7);

  const [
    openLeads,
    pipeline,
    viewingsInRange,
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
        outcome: { not: "CANCELLED" },
        startsAt: { gte: range.from, lte: range.to },
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
      where: {
        organizationId,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { createdAt: true },
    }),
    prisma.lead.groupBy({
      by: ["stage"],
      where: { organizationId },
      _count: { _all: true },
      _sum: { dealValueAed: true },
    }),
    prisma.leadSourceEvent.findMany({
      where: {
        lead: { organizationId },
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { source: true, leadId: true },
    }),
    prisma.calendarEvent.findMany({
      where: {
        organizationId,
        type: "VIEWING",
        outcome: "SCHEDULED",
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
        outcome: "SCHEDULED",
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

  const chart = buildChartBuckets(
    range,
    leads.map((l) => new Date(l.createdAt)),
  );

  const peak = chart.reduce(
    (best, row) => (row.count > best.count ? row : best),
    chart[0] || { label: "-", count: 0, day: "", date: "" },
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
    viewingsWeek: viewingsInRange,
    closeRate,
    winRateOpen,
    won,
    lost,
    listingsActive,
    listingsDraft,
    newLeadsChart: chart,
    newLeadsWeek: leads.length,
    peakDay: peak ? { label: peak.label, count: peak.count } : null,
    range: {
      preset: range.preset,
      from: range.fromKey,
      to: range.toKey,
      label: range.label,
      days: range.days,
      granularity: range.granularity,
    },
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

const METRICS: TrendMetric[] = ["leads", "viewings", "won"];

async function trendItems(
  organizationId: string,
  metric: TrendMetric,
  from: Date,
  to: Date,
): Promise<TrendItem[]> {
  if (metric === "viewings") {
    const rows = await prisma.calendarEvent.findMany({
      where: { organizationId, type: "VIEWING", startsAt: { gte: from, lte: to } },
      select: { startsAt: true, outcome: true, cancelReason: true },
    });
    return viewingTrendItems(rows, new Date());
  }
  if (metric === "won") {
    // The date a deal is counted is the last time the lead was updated while in WON.
    const rows = await prisma.lead.findMany({
      where: { organizationId, stage: "WON", updatedAt: { gte: from, lte: to } },
      select: { updatedAt: true, primarySource: true, dealValueAed: true },
    });
    return rows.map((r) => ({ at: r.updatedAt, key: r.primarySource, value: r.dealValueAed ?? 0 }));
  }
  const rows = await prisma.lead.findMany({
    where: { organizationId, createdAt: { gte: from, lte: to } },
    select: { createdAt: true, primarySource: true },
  });
  return rows.map((r) => ({ at: r.createdAt, key: r.primarySource }));
}

/**
 * Trend chart data. Query: range/from/to (same as kpis), group=day|week|month (optional),
 * metric=leads|viewings|won, compare=1 to add the previous period of equal length.
 */
dashboardRouter.get("/trend", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const metric = METRICS.includes(req.query.metric as TrendMetric)
    ? (req.query.metric as TrendMetric)
    : "leads";
  const range = resolveDateRange(req.query);
  const group = pickGroup(req.query.group, range.days);
  const compare = req.query.compare === "1" || req.query.compare === "true";

  const items = await trendItems(organizationId, metric, range.from, range.to);

  let prevItems: TrendItem[] | null = null;
  if (compare) {
    const prevTo = endOfDay(new Date(startOfDay(range.from).getTime() - 86400000));
    const prevFrom = startOfDay(new Date(prevTo.getTime() - (range.days - 1) * 86400000));
    prevItems = await trendItems(organizationId, metric, prevFrom, prevTo);
  }

  const buckets = buildTrend(range, group, items, prevItems);
  const prevValue = prevItems ? prevItems.reduce((s, i) => s + (i.value ?? 0), 0) : null;
  const totals = summarize(buckets, prevItems ? totalOf(prevItems) : null, prevValue);

  res.json({
    metric,
    group,
    allowedGroups: allowedGroups(range.days),
    compare,
    range: {
      preset: range.preset,
      from: range.fromKey,
      to: range.toKey,
      label: range.label,
      days: range.days,
    },
    totals,
    buckets,
  });
});
