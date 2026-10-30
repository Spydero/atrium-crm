import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const moneyRouter = Router();
moneyRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

const SOURCE_TO_PORTAL: Record<string, string | null> = {
  BAYUT: "BAYUT",
  PROPERTY_FINDER: "PROPERTY_FINDER",
  DUBIZZLE: "DUBIZZLE",
  SKYLOOV: "SKYLOOV",
  MANUAL: null,
  WHATSAPP: null,
  META: null,
  REFERRAL: null,
  WEBSITE: null,
};

moneyRouter.get("/map", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const [sourceEvents, completedViewings, wins, budgets, overdue] = await Promise.all([
    prisma.leadSourceEvent.findMany({
      where: { lead: { organizationId } },
      include: { lead: { select: { id: true, stage: true, dealValueAed: true } } },
    }),
    prisma.calendarEvent.findMany({
      where: { organizationId, type: "VIEWING", outcome: "COMPLETED" },
      include: { lead: { include: { sources: true } } },
    }),
    prisma.lead.findMany({
      where: { organizationId, stage: "WON" },
      include: { sources: true },
    }),
    prisma.portalBudget.findMany({ where: { organizationId } }),
    prisma.calendarEvent.findMany({
      where: {
        organizationId,
        startsAt: { lt: new Date() },
        OR: [{ outcome: "SCHEDULED" }, { outcome: null }],
        leadId: { not: null },
      },
      include: { lead: { select: { dealValueAed: true, name: true } } },
    }),
  ]);

  const sources = [
    "BAYUT",
    "PROPERTY_FINDER",
    "DUBIZZLE",
    "SKYLOOV",
    "WHATSAPP",
    "META",
    "MANUAL",
    "REFERRAL",
    "WEBSITE",
  ] as const;

  const rows = sources.map((source) => {
    const leads = new Set(
      sourceEvents.filter((e) => e.source === source).map((e) => e.leadId),
    );
    const viewings = completedViewings.filter((v) =>
      v.lead?.sources.some((s) => s.source === source),
    ).length;
    const won = wins.filter((w) => w.sources.some((s) => s.source === source));
    const wonValue = won.reduce((sum, w) => sum + (w.dealValueAed ?? 0), 0);
    const portal = SOURCE_TO_PORTAL[source];
    const spend =
      portal != null
        ? budgets.find((b) => b.portal === portal)?.monthlySpendAed ?? 0
        : 0;
    return {
      source,
      leads: leads.size,
      completedViewings: viewings,
      wins: won.length,
      wonValueAed: wonValue,
      monthlySpendAed: spend,
      costPerViewing: viewings > 0 && spend > 0 ? Math.round(spend / viewings) : null,
      costPerWin: won.length > 0 && spend > 0 ? Math.round(spend / won.length) : null,
    };
  });

  const atRiskAed = overdue.reduce(
    (sum, e) => sum + (e.lead?.dealValueAed ?? 0),
    0,
  );

  res.json({
    rows: rows.filter((r) => r.leads > 0 || r.monthlySpendAed > 0 || r.completedViewings > 0),
    atRiskAed,
    overdueCount: overdue.length,
    overdue: overdue.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      leadName: e.lead?.name,
      dealValueAed: e.lead?.dealValueAed,
    })),
  });
});
