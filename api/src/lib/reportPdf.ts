import {
  COLORS,
  MARGIN,
  PAGE_H,
  PAGE_W,
  docToBuffer,
  formatDate,
  line,
  sectionLabel,
  type Doc,
} from "./pdfTheme.js";
import { labelize } from "./csv.js";
import type { ReportSummary } from "./reportData.js";

const CONTENT_W = PAGE_W - MARGIN * 2;
const GAP = 18;
const COL_W = (CONTENT_W - GAP) / 2;

const STAGE_COLORS: Record<string, string> = {
  NEW: "#64748b",
  QUALIFIED: "#1a5f7a",
  VIEWING: "#0d9488",
  OFFER: "#c45c26",
  WON: "#15803d",
  LOST: "#b91c1c",
};

type BarRow = { label: string; value: number; color?: string };

function panel(doc: Doc, x: number, y: number, w: number, h: number) {
  doc.roundedRect(x, y, w, h, 10).fill(COLORS.white);
  doc.roundedRect(x, y, w, h, 10).lineWidth(0.7).strokeColor(COLORS.line).stroke();
}

function barsPanel(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: BarRow[],
  opts: { minRows?: number; color?: string; emptyText?: string } = {},
) {
  const rowH = 23;
  const count = Math.max(rows.length, opts.minRows ?? 3);
  const h = 42 + count * rowH + 6;
  panel(doc, x, y, w, h);
  sectionLabel(doc, title, x + 16, y + 16);

  if (!rows.length) {
    line(doc, opts.emptyText || "No data in this period", x + 16, y + 52, {
      size: 9.5,
      color: COLORS.muted,
    });
    return h;
  }

  const max = Math.max(...rows.map((r) => r.value), 1);
  const labelW = 86;
  const valueW = 28;
  const trackX = x + 16 + labelW;
  const trackW = w - 32 - labelW - valueW;
  rows.forEach((r, i) => {
    const ry = y + 42 + i * rowH;
    line(doc, r.label, x + 16, ry + 3, {
      size: 9,
      color: COLORS.body,
      width: labelW - 6,
    });
    doc.roundedRect(trackX, ry + 2, trackW, 10, 5).fill(COLORS.track);
    const bw = Math.max(r.value > 0 ? 8 : 0, (r.value / max) * trackW);
    if (bw > 0) {
      doc.roundedRect(trackX, ry + 2, bw, 10, 5).fill(r.color || opts.color || COLORS.accent);
    }
    line(doc, String(r.value), trackX + trackW + 6, ry + 2.5, {
      size: 9.5,
      font: "Helvetica-Bold",
      color: COLORS.ink,
      width: valueW - 4,
      align: "right",
    });
  });
  return h;
}

function kpi(doc: Doc, x: number, y: number, w: number, value: string, label: string, sub: string, accent: string) {
  panel(doc, x, y, w, 70);
  doc.roundedRect(x, y, 4, 70, 2).fill(accent);
  line(doc, label.toUpperCase(), x + 16, y + 14, {
    size: 7,
    font: "Helvetica-Bold",
    color: COLORS.muted,
    spacing: 1,
    width: w - 24,
  });
  line(doc, value, x + 16, y + 28, {
    size: 24,
    font: "Helvetica-Bold",
    color: COLORS.ink,
    width: w - 24,
  });
  line(doc, sub, x + 16, y + 56, { size: 7.5, color: COLORS.muted, width: w - 24 });
}

function pageChrome(doc: Doc, orgName: string, page: number, total: number) {
  doc.rect(0, PAGE_H - 36, PAGE_W, 36).fill(COLORS.dark);
  doc.rect(0, PAGE_H - 36, PAGE_W, 2).fill(COLORS.mark);
  line(doc, orgName, MARGIN, PAGE_H - 22, {
    size: 8.5,
    font: "Helvetica-Bold",
    color: COLORS.white,
    width: 300,
  });
  line(doc, `Page ${page} of ${total}   |   Generated ${formatDate(new Date())}`, MARGIN, PAGE_H - 22, {
    size: 7.5,
    color: "#8b949e",
    width: CONTENT_W,
    align: "right",
  });
}

export async function buildReportPdf(
  data: ReportSummary,
  org: { name: string; currencyLabel: string },
): Promise<Buffer> {
  const totalLeads = data.leadsByStage.reduce((s, r) => s + r.count, 0);
  const won = data.leadsByStage.find((s) => s.stage === "WON")?.count ?? 0;
  const lost = data.leadsByStage.find((s) => s.stage === "LOST")?.count ?? 0;
  const closed = won + lost;
  const winRate = closed ? Math.round((won / closed) * 100) : 0;
  const viewingsDone = data.viewingOutcomes.find((v) => v.outcome === "COMPLETED")?.count ?? 0;
  const viewingsTotal = data.viewingOutcomes.reduce((s, v) => s + v.count, 0);
  const listingsTotal = data.listingsByStatus.reduce((s, r) => s + r.count, 0);

  const stageRows: BarRow[] = data.leadsByStage.map((s) => ({
    label: labelize(s.stage),
    value: s.count,
    color: STAGE_COLORS[s.stage],
  }));
  const sourceRows: BarRow[] = data.leadsBySource.map((s) => ({
    label: labelize(s.source),
    value: s.count,
  }));
  const winRows: BarRow[] = data.winsBySource.map((s) => ({
    label: labelize(s.source),
    value: s.count,
    color: COLORS.green,
  }));
  const viewRows: BarRow[] = data.viewingOutcomes.map((v) => ({
    label: labelize(v.outcome),
    value: v.count,
    color:
      v.outcome === "COMPLETED"
        ? COLORS.green
        : v.outcome === "NO_SHOW"
          ? "#b91c1c"
          : v.outcome === "CANCELLED"
            ? "#94a3b8"
            : COLORS.teal,
  }));
  const listingRows: BarRow[] = data.listingsByStatus.map((s) => ({
    label: labelize(s.status),
    value: s.count,
    color: s.status === "ACTIVE"
        ? COLORS.green
        : s.status === "DRAFT" || s.status === "WITHDRAWN"
          ? "#94a3b8"
          : COLORS.mark,
  }));
  const agentRows: BarRow[] = data.agentLeaderboard.slice(0, 6).map((a) => ({
    label: a.name,
    value: a.leads,
    color: COLORS.accent,
  }));

  const buf = await docToBuffer(
    (doc) => {
      // Header
      const g = doc.linearGradient(0, 0, PAGE_W, 150);
      g.stop(0, COLORS.dark).stop(1, "#1b3a4a");
      doc.rect(0, 0, PAGE_W, 150).fill(g);
      doc.rect(0, 150, PAGE_W, 3).fill(COLORS.mark);
      line(doc, org.name.toUpperCase(), MARGIN, 34, {
        size: 10,
        font: "Helvetica-Bold",
        color: COLORS.accentLight,
        spacing: 1.8,
        width: 360,
      });
      line(doc, "Performance report", MARGIN, 56, {
        size: 30,
        font: "Helvetica-Bold",
        color: COLORS.white,
      });
      line(doc, data.range.label, MARGIN, 98, { size: 12, color: COLORS.white, opacity: 0.9 });
      line(
        doc,
        `${data.range.from}  to  ${data.range.to}   |   ${data.range.days} days`,
        MARGIN,
        118,
        { size: 9, color: "#9fb3bf" },
      );
      line(doc, "ATRIUM", MARGIN, 34, {
        size: 8,
        font: "Helvetica-Bold",
        color: "#9fb3bf",
        spacing: 2,
        width: CONTENT_W,
        align: "right",
      });

      // KPI row
      let y = 176;
      const kw = (CONTENT_W - 12 * 3) / 4;
      kpi(doc, MARGIN, y, kw, String(totalLeads), "New leads", "created in period", COLORS.accent);
      kpi(doc, MARGIN + (kw + 12), y, kw, String(won), "Deals won", `${lost} lost`, COLORS.green);
      kpi(
        doc,
        MARGIN + (kw + 12) * 2,
        y,
        kw,
        closed ? `${winRate}%` : "-",
        "Win rate",
        closed ? `${won} of ${closed} closed` : "no closed deals",
        COLORS.mark,
      );
      kpi(
        doc,
        MARGIN + (kw + 12) * 3,
        y,
        kw,
        String(viewingsTotal),
        "Viewings",
        `${viewingsDone} completed`,
        COLORS.teal,
      );

      // Row 1: stages + sources
      y += 70 + 18;
      const h1 = barsPanel(doc, MARGIN, y, COL_W, "Leads by stage", stageRows, { minRows: 6 });
      const h2 = barsPanel(doc, MARGIN + COL_W + GAP, y, COL_W, "Leads by source", sourceRows, {
        minRows: 6,
      });
      y += Math.max(h1, h2) + 16;

      // Row 2: wins + viewings
      const h3 = barsPanel(doc, MARGIN, y, COL_W, "Deals won by source", winRows, {
        minRows: 4,
        emptyText: "No deals won in this period",
      });
      const h4 = barsPanel(doc, MARGIN + COL_W + GAP, y, COL_W, "Viewing outcomes", viewRows, {
        minRows: 4,
      });
      y += Math.max(h3, h4) + 16;

      // Row 3: inventory + agents
      const h5 = barsPanel(
        doc,
        MARGIN,
        y,
        COL_W,
        `Inventory (${listingsTotal} listings, current)`,
        listingRows,
        { minRows: 4 },
      );
      const h6 = barsPanel(doc, MARGIN + COL_W + GAP, y, COL_W, "Agent leaderboard", agentRows, {
        minRows: 4,
        emptyText: "No assigned leads in this period",
      });
      y += Math.max(h5, h6) + 16;

      // Portals line (if space)
      const live = data.portalsByStatus
        .filter((p) => p.status === "LIVE")
        .reduce((s, p) => s + p.count, 0);
      if (y < PAGE_H - 90) {
        line(
          doc,
          `Portal distribution: ${live} live portal listing${live === 1 ? "" : "s"} across ${new Set(data.portalsByStatus.map((p) => p.portal)).size} portals.`,
          MARGIN,
          y,
          { size: 8.5, color: COLORS.muted, width: CONTENT_W },
        );
      }

      pageChrome(doc, org.name, 1, 1);
    },
    { Title: `Performance report ${data.range.from} to ${data.range.to}`, Author: org.name },
  );
  return buf;
}
