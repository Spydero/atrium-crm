import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { resolveDateRange } from "../lib/dateRange.js";
import { computeReportSummary } from "../lib/reportData.js";
import { csvFilename, labelize, toCsv } from "../lib/csv.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

reportsRouter.get("/summary", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const range = resolveDateRange(req.query);
  res.json(await computeReportSummary(organizationId, range));
});

reportsRouter.get("/export.csv", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const range = resolveDateRange(req.query);
  const d = await computeReportSummary(organizationId, range);

  const rows: (string | number)[][] = [];
  const add = (section: string, items: { label: string; value: number }[]) => {
    for (const i of items) rows.push([section, i.label, i.value, d.range.from, d.range.to]);
  };
  add("Leads by stage", d.leadsByStage.map((r) => ({ label: labelize(r.stage), value: r.count })));
  add("Leads by source", d.leadsBySource.map((r) => ({ label: labelize(r.source), value: r.count })));
  add("Deals won by source", d.winsBySource.map((r) => ({ label: labelize(r.source), value: r.count })));
  add("Viewing outcomes", d.viewingOutcomes.map((r) => ({ label: labelize(r.outcome), value: r.count })));
  add("Inventory by status (current)", d.listingsByStatus.map((r) => ({ label: labelize(r.status), value: r.count })));
  add(
    "Portal status (current)",
    d.portalsByStatus.map((r) => ({ label: `${labelize(r.portal)} - ${labelize(r.status)}`, value: r.count })),
  );
  add("Agent leaderboard", d.agentLeaderboard.map((r) => ({ label: r.name, value: r.leads })));

  add("Guide requests by channel", d.guides.channels.map((c) => ({ label: c.channel, value: c.requests })));
  for (const g of d.guides.guides) {
    add(`Guide: ${g.title}`, [
      { label: "Views", value: g.views },
      { label: "Requests", value: g.requests },
      { label: "Downloads", value: g.totalDownloads },
      { label: "Leads", value: g.leads },
      { label: "Reached viewing", value: g.reachedViewing },
      { label: "Won", value: g.won },
    ]);
  }

  const csv = toCsv(["Section", "Label", "Count", "From", "To"], rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${csvFilename("report")}"`);
  res.send(csv);
});

reportsRouter.get("/export.pdf", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const range = resolveDateRange(req.query);
  const [data, org] = await Promise.all([
    computeReportSummary(organizationId, range),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, currencyLabel: true },
    }),
  ]);
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const { buildReportPdf } = await import("../lib/reportPdf.js");
  const pdf = await buildReportPdf(data, org);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="report-${data.range.from}-to-${data.range.to}.pdf"`,
  );
  res.send(pdf);
});
