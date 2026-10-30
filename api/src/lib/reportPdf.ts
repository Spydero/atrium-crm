import {
  COLORS,
  CONTENT_W,
  MARGIN,
  PAGE_W,
  docToBuffer,
  hairline,
  line,
  longDate,
  longDateFromKey,
  pageFooter,
  pageHeader,
  sectionHeading,
  type Doc,
} from "./pdfTheme.js";
import { labelize } from "./csv.js";
import type { ReportSummary } from "./reportData.js";

const GUTTER = 24;
const HALF_W = (CONTENT_W - GUTTER) / 2;
const ROW_H = 19;

type Row = { label: string; value: number };

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function pct(value: number, total: number) {
  if (!total) return "-";
  return `${Math.round((value / total) * 100)}%`;
}

/** Ruled table with header band, share column, inline distribution bar and total. */
function dataTable(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: Row[],
  opts: { emptyText?: string; countHeader?: string } = {},
) {
  line(doc, title, x, y, { size: 11, font: "Times-Bold", color: COLORS.navy, width: w });
  let cy = y + 19;

  // header band
  doc.rect(x, cy, w, 20).fill(COLORS.navy);
  const shareW = 38;
  const countW = 34;
  const barW = 52;
  const shareX = x + w - 8 - shareW;
  const countX = shareX - countW - 4;
  const barX = countX - barW - 10;
  const labelW = barX - (x + 10) - 6;
  const head = { size: 6.5, font: "Helvetica-Bold" as const, color: COLORS.white, spacing: 1.2 };
  line(doc, "CATEGORY", x + 10, cy + 7, head);
  line(doc, (opts.countHeader || "COUNT").toUpperCase(), countX - 14, cy + 7, {
    ...head,
    width: countW + 14,
    align: "right",
  });
  line(doc, "SHARE", shareX - 4, cy + 7, { ...head, width: shareW + 4, align: "right" });
  cy += 20;

  if (!rows.length) {
    doc.rect(x, cy, w, ROW_H + 4).fill(COLORS.tint);
    line(doc, opts.emptyText || "No data recorded in this period", x + 10, cy + 6, {
      size: 9.5,
      font: "Times-Italic",
      color: COLORS.muted,
      width: w - 20,
    });
    cy += ROW_H + 4;
    hairline(doc, x, cy, x + w, COLORS.navy, 0.8);
    return cy - y;
  }

  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);
  rows.forEach((r, i) => {
    if (i % 2 === 1) doc.rect(x, cy, w, ROW_H).fill(COLORS.tint);
    line(doc, r.label, x + 10, cy + 5.5, {
      size: 10,
      font: "Times-Roman",
      color: COLORS.ink,
      width: labelW,
    });
    // distribution bar
    doc.rect(barX, cy + 7.5, barW, 4).fill(COLORS.hair);
    if (r.value > 0) doc.rect(barX, cy + 7.5, Math.max(2, (r.value / max) * barW), 4).fill(COLORS.navySoft);
    line(doc, String(r.value), countX, cy + 5.5, {
      size: 10,
      font: "Times-Bold",
      color: COLORS.ink,
      width: countW,
      align: "right",
    });
    line(doc, pct(r.value, total), shareX, cy + 6, {
      size: 8.5,
      font: "Helvetica",
      color: COLORS.muted,
      width: shareW,
      align: "right",
    });
    cy += ROW_H;
  });

  // total row
  hairline(doc, x, cy, x + w, COLORS.navy, 0.8);
  line(doc, "Total", x + 10, cy + 6, {
    size: 10,
    font: "Times-Bold",
    color: COLORS.navy,
    width: labelW,
  });
  line(doc, String(total), countX, cy + 6, {
    size: 10,
    font: "Times-Bold",
    color: COLORS.navy,
    width: countW,
    align: "right",
  });
  line(doc, total ? "100%" : "-", shareX, cy + 6.5, {
    size: 8.5,
    font: "Helvetica-Bold",
    color: COLORS.navy,
    width: shareW,
    align: "right",
  });
  cy += ROW_H + 2;
  hairline(doc, x, cy, x + w, COLORS.line, 0.5);
  return cy - y;
}

function pctRate(r: number) {
  return `${Math.round(r * 1000) / 10}%`;
}

type GuideRow = ReportSummary["guides"]["guides"][number];

function guideTable(doc: Doc, y: number, rows: GuideRow[]) {
  const x = MARGIN;
  const w = CONTENT_W;
  line(doc, "Performance by guide", x, y, { size: 11, font: "Times-Bold", color: COLORS.navy, width: w });
  let cy = y + 19;
  doc.rect(x, cy, w, 20).fill(COLORS.navy);
  const colW = 53;
  const cols = ["VIEWS", "REQUESTS", "DOWNLOADS", "LEADS", "VIEWING+", "WON"];
  const head = { size: 6.5, font: "Helvetica-Bold" as const, color: COLORS.white, spacing: 0.6 };
  line(doc, "GUIDE", x + 10, cy + 7, head);
  cols.forEach((c, i) => {
    line(doc, c, x + w - 8 - (cols.length - i) * colW, cy + 7, { ...head, width: colW - 4, align: "right" });
  });
  cy += 20;
  rows.slice(0, 10).forEach((r, i) => {
    if (i % 2 === 1) doc.rect(x, cy, w, ROW_H).fill(COLORS.tint);
    line(doc, r.title, x + 10, cy + 5.5, {
      size: 10,
      font: "Times-Roman",
      color: COLORS.ink,
      width: w - 16 - cols.length * colW - 10,
    });
    const vals = [r.views, r.requests, r.totalDownloads, r.leads, r.reachedViewing, r.won];
    vals.forEach((v, ci) => {
      line(doc, String(v), x + w - 8 - (cols.length - ci) * colW, cy + 5.5, {
        size: 10,
        font: v ? "Times-Bold" : "Times-Roman",
        color: v ? COLORS.ink : COLORS.muted,
        width: colW - 4,
        align: "right",
      });
    });
    cy += ROW_H;
  });
  hairline(doc, x, cy, x + w, COLORS.navy, 0.8);
  return cy - y;
}

function portalTable(
  doc: Doc,
  y: number,
  data: { portal: string; status: string; count: number }[],
) {
  const x = MARGIN;
  const w = CONTENT_W;
  const cols = ["LIVE", "PENDING", "REJECTED"];
  const colW = 70;
  const portals = [...new Set(data.map((d) => d.portal))];

  line(doc, "Listings by portal and publishing status", x, y, {
    size: 11,
    font: "Times-Bold",
    color: COLORS.navy,
    width: w,
  });
  let cy = y + 19;
  doc.rect(x, cy, w, 20).fill(COLORS.navy);
  line(doc, "PORTAL", x + 10, cy + 7, {
    size: 6.5,
    font: "Helvetica-Bold",
    color: COLORS.white,
    spacing: 1.2,
  });
  cols.forEach((c, i) => {
    line(doc, c, x + w - 10 - (cols.length - i) * colW, cy + 7, {
      size: 6.5,
      font: "Helvetica-Bold",
      color: COLORS.white,
      spacing: 1.2,
      width: colW - 10,
      align: "right",
    });
  });
  cy += 20;

  if (!portals.length) {
    doc.rect(x, cy, w, ROW_H + 4).fill(COLORS.tint);
    line(doc, "No portal activity recorded", x + 10, cy + 6, {
      size: 9.5,
      font: "Times-Italic",
      color: COLORS.muted,
    });
    cy += ROW_H + 4;
  } else {
    portals.forEach((p, i) => {
      if (i % 2 === 1) doc.rect(x, cy, w, ROW_H).fill(COLORS.tint);
      line(doc, labelize(p), x + 10, cy + 5.5, {
        size: 10,
        font: "Times-Roman",
        color: COLORS.ink,
        width: 200,
      });
      ["LIVE", "PENDING", "REJECTED"].forEach((status, ci) => {
        const n = data.find((d) => d.portal === p && d.status === status)?.count ?? 0;
        line(doc, String(n), x + w - 10 - (cols.length - ci) * colW, cy + 5.5, {
          size: 10,
          font: n ? "Times-Bold" : "Times-Roman",
          color: n ? COLORS.ink : COLORS.muted,
          width: colW - 10,
          align: "right",
        });
      });
      cy += ROW_H;
    });
  }
  hairline(doc, x, cy, x + w, COLORS.navy, 0.8);
  return cy - y;
}

function indicator(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  label: string,
  note: string,
  divider: boolean,
) {
  if (divider) {
    doc
      .moveTo(x, y + 10)
      .lineTo(x, y + h - 10)
      .lineWidth(0.5)
      .strokeColor(COLORS.line)
      .stroke();
  }
  line(doc, value, x, y + 10, {
    size: 26,
    font: "Times-Bold",
    color: COLORS.navy,
    width: w,
    align: "center",
  });
  line(doc, label.toUpperCase(), x, y + 43, {
    size: 6.5,
    font: "Helvetica-Bold",
    color: COLORS.muted,
    spacing: 1.2,
    width: w,
    align: "center",
  });
  line(doc, note, x, y + 54, {
    size: 8.5,
    font: "Times-Italic",
    color: COLORS.muted,
    width: w - 8,
    align: "center",
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
  const winRate = closed ? Math.round((won / closed) * 100) : null;
  const viewingsTotal = data.viewingOutcomes.reduce((s, v) => s + v.count, 0);
  const viewingsDone = data.viewingOutcomes.find((v) => v.outcome === "COMPLETED")?.count ?? 0;
  const listingsTotal = data.listingsByStatus.reduce((s, r) => s + r.count, 0);
  const listingsActive = data.listingsByStatus.find((r) => r.status === "ACTIVE")?.count ?? 0;
  const topSource = data.leadsBySource[0];

  const fromLong = longDateFromKey(data.range.from);
  const toLong = longDateFromKey(data.range.to);

  const summary = [
    `Between ${fromLong} and ${toLong}, ${org.name} recorded ${plural(totalLeads, "new lead")}` +
      (topSource && totalLeads
        ? `, with ${labelize(topSource.source)} the leading source (${topSource.count} ${topSource.count === 1 ? "enquiry" : "enquiries"}).`
        : "."),
    closed
      ? `${plural(won, "deal")} ${won === 1 ? "was" : "were"} won and ${lost} lost, giving a win rate of ${winRate}% across closed opportunities.`
      : "No deals were closed in the period.",
    viewingsTotal
      ? `${plural(viewingsTotal, "viewing")} ${viewingsTotal === 1 ? "was" : "were"} scheduled, of which ${viewingsDone} ${viewingsDone === 1 ? "has" : "have"} been completed.`
      : "No viewings were scheduled in the period.",
    `The current inventory comprises ${plural(listingsTotal, "listing")}, of which ${listingsActive} ${listingsActive === 1 ? "is" : "are"} active.`,
  ].join(" ");

  const stageRows: Row[] = data.leadsByStage.map((s) => ({
    label: labelize(s.stage),
    value: s.count,
  }));
  const sourceRows: Row[] = data.leadsBySource.map((s) => ({
    label: labelize(s.source),
    value: s.count,
  }));
  const winRows: Row[] = data.winsBySource.map((s) => ({
    label: labelize(s.source),
    value: s.count,
  }));
  const viewRows: Row[] = data.viewingOutcomes.map((v) => ({
    label: labelize(v.outcome),
    value: v.count,
  }));
  const listingRows: Row[] = data.listingsByStatus.map((s) => ({
    label: labelize(s.status),
    value: s.count,
  }));
  const agentRows: Row[] = data.agentLeaderboard.slice(0, 8).map((a) => ({
    label: a.name,
    value: a.leads,
  }));

  const footerNote = "Confidential. Prepared for internal use.";
  const g = data.guides;
  const hasGuides = g.guides.length > 0;
  const TOTAL_PAGES = hasGuides ? 3 : 2;

  return docToBuffer(
    (doc) => {
      doc.rect(0, 0, PAGE_W, 841.89).fill(COLORS.white);

      // ===== Page 1 =====
      pageHeader(doc, org.name, "Performance Report");

      line(doc, "Performance Report", MARGIN, 82, {
        size: 32,
        font: "Times-Bold",
        color: COLORS.navy,
        width: CONTENT_W,
      });
      line(doc, `Reporting period: ${fromLong} to ${toLong} (${plural(data.range.days, "day")})`, MARGIN, 124, {
        size: 12,
        font: "Times-Italic",
        color: COLORS.muted,
        width: CONTENT_W,
      });
      line(doc, `Prepared ${longDate(new Date())}`, MARGIN, 144, {
        size: 8.5,
        font: "Helvetica",
        color: COLORS.muted,
        spacing: 0.4,
      });
      doc.rect(MARGIN, 166, 44, 2.5).fill(COLORS.gold);

      // Executive summary
      let y = 190;
      sectionHeading(doc, "Executive summary", MARGIN, y, CONTENT_W);
      doc.font("Times-Roman").fontSize(11);
      const sumH = doc.heightOfString(summary, { width: CONTENT_W, lineGap: 4 });
      doc.fillColor(COLORS.body).text(summary, MARGIN, y + 26, {
        width: CONTENT_W,
        lineGap: 4,
        align: "justify",
      });
      y += 26 + sumH + 24;

      // Key indicators
      sectionHeading(doc, "Key indicators", MARGIN, y, CONTENT_W);
      y += 26;
      const kh = 74;
      hairline(doc, MARGIN, y, PAGE_W - MARGIN, COLORS.navy, 1);
      hairline(doc, MARGIN, y + kh, PAGE_W - MARGIN, COLORS.line, 0.6);
      const kw = CONTENT_W / 4;
      indicator(doc, MARGIN, y, kw, kh, String(totalLeads), "New leads", "created in period", false);
      indicator(doc, MARGIN + kw, y, kw, kh, String(won), "Deals won", `${lost} lost`, true);
      indicator(
        doc,
        MARGIN + kw * 2,
        y,
        kw,
        kh,
        winRate == null ? "-" : `${winRate}%`,
        "Win rate",
        closed ? `${won} of ${closed} closed` : "no closed deals",
        true,
      );
      indicator(
        doc,
        MARGIN + kw * 3,
        y,
        kw,
        kh,
        String(viewingsTotal),
        "Viewings",
        `${viewingsDone} completed`,
        true,
      );
      y += kh + 26;

      // Lead pipeline
      sectionHeading(doc, "Lead pipeline", MARGIN, y, CONTENT_W);
      y += 26;
      const h1 = dataTable(doc, MARGIN, y, HALF_W, "Leads by stage", stageRows);
      const h2 = dataTable(doc, MARGIN + HALF_W + GUTTER, y, HALF_W, "Leads by source", sourceRows, {
        emptyText: "No enquiries recorded in this period",
      });
      void Math.max(h1, h2);

      pageFooter(doc, org.name, 1, TOTAL_PAGES, footerNote);

      // ===== Page 2 =====
      doc.addPage();
      doc.rect(0, 0, PAGE_W, 841.89).fill(COLORS.white);
      pageHeader(doc, org.name, "Performance Report");

      y = 84;
      sectionHeading(doc, "Conversion and viewings", MARGIN, y, CONTENT_W);
      y += 26;
      const h3 = dataTable(doc, MARGIN, y, HALF_W, "Deals won by source", winRows, {
        emptyText: "No deals won in this period",
      });
      const h3b = dataTable(doc, MARGIN + HALF_W + GUTTER, y, HALF_W, "Viewing outcomes", viewRows);
      y += Math.max(h3, h3b) + 24;

      sectionHeading(doc, "Inventory and team", MARGIN, y, CONTENT_W);
      y += 26;
      const h4 = dataTable(doc, MARGIN, y, HALF_W, "Listings by status (current)", listingRows, {
        emptyText: "No listings on record",
        countHeader: "Listings",
      });
      const h5 = dataTable(doc, MARGIN + HALF_W + GUTTER, y, HALF_W, "Lead allocation by agent", agentRows, {
        emptyText: "No assigned leads in this period",
        countHeader: "Leads",
      });
      y += Math.max(h4, h5) + 26;

      sectionHeading(doc, "Portal distribution", MARGIN, y, CONTENT_W);
      y += 26;
      const h6 = portalTable(doc, y, data.portalsByStatus);
      y += h6 + 28;

      sectionHeading(doc, "Notes and definitions", MARGIN, y, CONTENT_W);
      y += 26;
      const notes = [
        "Leads are counted by the date they were created. A lead that enquired through several channels is counted once per channel in the source table.",
        "Win rate is deals won divided by deals won plus deals lost. Open opportunities are excluded.",
        "Viewings are counted by their scheduled date within the reporting period.",
        "Inventory and portal tables show the position at the time of generation and are not limited to the reporting period.",
      ];
      notes.forEach((n, i) => {
        line(doc, `${i + 1}.`, MARGIN, y, { size: 9.5, font: "Times-Bold", color: COLORS.navy });
        doc.font("Times-Roman").fontSize(9.5);
        const h = doc.heightOfString(n, { width: CONTENT_W - 22, lineGap: 2 });
        doc.fillColor(COLORS.body).text(n, MARGIN + 22, y, {
          width: CONTENT_W - 22,
          lineGap: 2,
        });
        y += h + 8;
      });

      pageFooter(doc, org.name, 2, TOTAL_PAGES, footerNote);

      // ===== Page 3: guides =====
      if (hasGuides) {
        doc.addPage();
        doc.rect(0, 0, PAGE_W, 841.89).fill(COLORS.white);
        pageHeader(doc, org.name, "Performance Report");

        y = 84;
        sectionHeading(doc, "Downloadable guides", MARGIN, y, CONTENT_W);
        y += 26;
        const gt = g.totals;
        const topGuide = [...g.guides].sort((a, b) => b.requests - a.requests)[0];
        const gSummary =
          `Guide pages were viewed ${gt.views} ${gt.views === 1 ? "time" : "times"}, producing ${plural(gt.requests, "request")} ` +
          `(${pctRate(gt.requestRate)} of views). ${gt.downloaded} of those ${gt.downloaded === 1 ? "was" : "were"} downloaded. ` +
          (topGuide && topGuide.requests
            ? `The strongest guide was "${topGuide.title}" with ${plural(topGuide.requests, "request")}. `
            : "") +
          `${g.guideLeadShare.guideLeads} of ${g.guideLeadShare.allLeads} new leads in the period first arrived through a guide.`;
        doc.font("Times-Roman").fontSize(10.5);
        const gh = doc.heightOfString(gSummary, { width: CONTENT_W, lineGap: 3 });
        doc.fillColor(COLORS.body).text(gSummary, MARGIN, y, { width: CONTENT_W, lineGap: 3, align: "justify" });
        y += gh + 18;

        const kh2 = 74;
        hairline(doc, MARGIN, y, PAGE_W - MARGIN, COLORS.navy, 1);
        hairline(doc, MARGIN, y + kh2, PAGE_W - MARGIN, COLORS.line, 0.6);
        indicator(doc, MARGIN, y, kw, kh2, String(gt.views), "Guide views", "page visits", false);
        indicator(doc, MARGIN + kw, y, kw, kh2, String(gt.requests), "Requests", `${pctRate(gt.requestRate)} of views`, true);
        indicator(doc, MARGIN + kw * 2, y, kw, kh2, String(gt.totalDownloads), "Downloads", `${pctRate(gt.downloadRate)} of requests`, true);
        indicator(doc, MARGIN + kw * 3, y, kw, kh2, String(gt.reachedViewing), "Reached viewing", `${gt.won} won`, true);
        y += kh2 + 24;

        y += guideTable(doc, y, g.guides) + 24;
        const chRows: Row[] = g.channels.slice(0, 8).map((c) => ({ label: c.channel, value: c.requests }));
        y += dataTable(doc, MARGIN, y, CONTENT_W, "Requests by channel", chRows, {
          emptyText: "No requests in this period",
          countHeader: "Requests",
        }) + 28;
        const gnotes = [
          "A request is one completed form. A download is counted each time the personal link or an open download is used.",
          "Views are daily totals and do not identify visitors. Leads reached viewing include later stages.",
        ];
        sectionHeading(doc, "Notes and definitions", MARGIN, y, CONTENT_W);
        y += 26;
        gnotes.forEach((n, i) => {
          line(doc, `${i + 1}.`, MARGIN, y, { size: 9.5, font: "Times-Bold", color: COLORS.navy });
          doc.font("Times-Roman").fontSize(9.5);
          const nh = doc.heightOfString(n, { width: CONTENT_W - 22, lineGap: 2 });
          doc.fillColor(COLORS.body).text(n, MARGIN + 22, y, { width: CONTENT_W - 22, lineGap: 2 });
          y += nh + 8;
        });

        pageFooter(doc, org.name, 3, TOTAL_PAGES, footerNote);
      }
    },
    { Title: `Performance report ${data.range.from} to ${data.range.to}`, Author: org.name },
  );
}
