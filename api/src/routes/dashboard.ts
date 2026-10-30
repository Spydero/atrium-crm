import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

dashboardRouter.get("/kpis", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [openLeads, pipeline, viewingsWeek, won, listingsActive, byDay] =
    await Promise.all([
      prisma.lead.count({
        where: {
          organizationId,
          stage: { notIn: ["WON", "LOST"] },
        },
      }),
      prisma.lead.aggregate({
        where: {
          organizationId,
          stage: { notIn: ["LOST"] },
        },
        _sum: { dealValueAed: true },
      }),
      prisma.calendarEvent.count({
        where: {
          organizationId,
          type: "VIEWING",
          startsAt: { gte: weekAgo },
        },
      }),
      prisma.lead.count({ where: { organizationId, stage: "WON" } }),
      prisma.listing.count({
        where: { organizationId, status: "ACTIVE" },
      }),
      prisma.lead.groupBy({
        by: ["createdAt"],
        where: { organizationId, createdAt: { gte: weekAgo } },
        _count: true,
      }),
    ]);

  const total = openLeads + won;
  const closeRate = total > 0 ? Math.round((won / total) * 100) : 0;

  // Simple Mon–Sun new leads
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const chart = days.map((d) => ({ day: d, count: 0 }));
  const leads = await prisma.lead.findMany({
    where: { organizationId, createdAt: { gte: weekAgo } },
    select: { createdAt: true },
  });
  for (const l of leads) {
    chart[l.createdAt.getDay()].count += 1;
  }

  res.json({
    openLeads,
    pipelineAed: pipeline._sum.dealValueAed ?? 0,
    viewingsWeek,
    closeRate,
    listingsActive,
    newLeadsChart: chart,
    byDayIgnored: byDay.length,
  });
});
