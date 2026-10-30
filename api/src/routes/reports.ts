import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { resolveDateRange } from "../lib/dateRange.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

const STAGES = ["NEW", "QUALIFIED", "VIEWING", "OFFER", "WON", "LOST"] as const;

reportsRouter.get("/summary", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const range = resolveDateRange(req.query);

  const [
    stageGroups,
    sourceEvents,
    viewings,
    listingStatus,
    portalRows,
    agents,
    wins,
  ] = await Promise.all([
    prisma.lead.groupBy({
      by: ["stage"],
      where: {
        organizationId,
        createdAt: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
    }),
    prisma.leadSourceEvent.findMany({
      where: {
        lead: { organizationId },
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { source: true, leadId: true },
    }),
    prisma.calendarEvent.groupBy({
      by: ["outcome"],
      where: {
        organizationId,
        type: "VIEWING",
        startsAt: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
    }),
    // Inventory snapshot (not time-scoped - industry pattern for stock)
    prisma.listing.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.listingPortalStatus.groupBy({
      by: ["portal", "status"],
      where: { listing: { organizationId } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["assignedToId"],
      where: {
        organizationId,
        assignedToId: { not: null },
        createdAt: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
    }),
    prisma.lead.findMany({
      where: {
        organizationId,
        stage: "WON",
        updatedAt: { gte: range.from, lte: range.to },
      },
      include: { sources: true },
    }),
  ]);

  const leadsByStage = STAGES.map((stage) => ({
    stage,
    count: stageGroups.find((g) => g.stage === stage)?._count._all ?? 0,
  }));

  const bySource = new Map<string, Set<string>>();
  for (const e of sourceEvents) {
    if (!bySource.has(e.source)) bySource.set(e.source, new Set());
    bySource.get(e.source)!.add(e.leadId);
  }
  const leadsBySource = [...bySource.entries()]
    .map(([source, set]) => ({ source, count: set.size }))
    .sort((a, b) => b.count - a.count);

  const winsBySourceMap = new Map<string, number>();
  for (const w of wins) {
    const src = w.sources[0]?.source || w.primarySource;
    winsBySourceMap.set(src, (winsBySourceMap.get(src) || 0) + 1);
  }
  const winsBySource = [...winsBySourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const viewingOutcomes = ["SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"].map(
    (outcome) => ({
      outcome,
      count: viewings.find((v) => v.outcome === outcome)?._count._all ?? 0,
    }),
  );

  const listingsByStatus = listingStatus.map((r) => ({
    status: r.status,
    count: r._count._all,
  }));

  const portalsByStatus = portalRows.map((r) => ({
    portal: r.portal,
    status: r.status,
    count: r._count._all,
  }));

  const userIds = agents
    .map((a) => a.assignedToId)
    .filter((id): id is string => Boolean(id));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const agentLeaderboard = agents
    .map((a) => ({
      agentId: a.assignedToId,
      name: users.find((u) => u.id === a.assignedToId)?.name || "Unassigned",
      leads: a._count._all,
    }))
    .sort((a, b) => b.leads - a.leads);

  res.json({
    range: {
      preset: range.preset,
      from: range.fromKey,
      to: range.toKey,
      label: range.label,
      days: range.days,
      granularity: range.granularity,
    },
    leadsByStage,
    leadsBySource,
    winsBySource,
    viewingOutcomes,
    listingsByStatus,
    portalsByStatus,
    agentLeaderboard,
  });
});
