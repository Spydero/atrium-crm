import { prisma } from "./prisma.js";
import type { ResolvedRange } from "./dateRange.js";
import { channelLabel, dayKey } from "./guideTools.js";

const REACHED_VIEWING = new Set(["VIEWING", "OFFER", "WON"]);

export type GuideStatRow = {
  guideId: string;
  title: string;
  status: string;
  audience: string;
  gated: boolean;
  views: number;
  requests: number;
  downloaded: number; // requests that were actually downloaded
  openDownloads: number; // direct downloads of an open guide (no form)
  totalDownloads: number;
  requestRate: number; // requests / views, 0..1
  downloadRate: number; // downloaded / requests, 0..1
  leads: number;
  reachedViewing: number;
  won: number;
  /** Views of form-first guides / of open guides (the two have different goals) */
  gatedViews: number;
  openViews: number;
  /** People who got the PDF in the period: first download of a request (by download date) + open downloads */
  newDownloads: number;
  /** The one conversion number that matters for this guide: gated = requests / views, open = downloads / views */
  conversionRate: number;
  conversionKind: "request" | "download";
};

export type ChannelRow = {
  channel: string;
  requests: number;
  downloaded: number;
  leads: number;
  reachedViewing: number;
};

export type GuideTotals = Omit<
  GuideStatRow,
  "guideId" | "title" | "status" | "audience" | "gated" | "conversionRate" | "conversionKind"
> & {
  /** requests / views of form-first guides only */
  requestRate: number;
  /** open downloads / views of open guides only */
  openDownloadRate: number;
};

export type GuideStats = {
  totals: GuideTotals;
  guides: GuideStatRow[];
  channels: ChannelRow[];
  /** Share of new leads in the range that came through a guide */
  guideLeadShare: { guideLeads: number; allLeads: number };
};

const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : 0);

export async function computeGuideStats(
  organizationId: string,
  range: ResolvedRange,
  guideIds?: string[],
): Promise<GuideStats> {
  const guides = await prisma.guide.findMany({
    where: { organizationId, ...(guideIds ? { id: { in: guideIds } } : {}) },
    select: { id: true, title: true, status: true, audience: true, gated: true },
    orderBy: { createdAt: "asc" },
  });
  const ids = guides.map((g) => g.id);

  const [stats, requests, firstDownloads, allLeads, guideLeadRows] = await Promise.all([
    prisma.guideDailyStat.findMany({
      where: { guideId: { in: ids }, date: { gte: range.fromKey, lte: range.toKey } },
    }),
    prisma.guideRequest.findMany({
      where: { guideId: { in: ids }, createdAt: { gte: range.from, lte: range.to } },
      select: {
        guideId: true,
        leadId: true,
        downloadCount: true,
        utmSource: true,
        utmMedium: true,
        referrer: true,
        lead: { select: { stage: true } },
      },
    }),
    prisma.guideRequest.findMany({
      where: { guideId: { in: ids }, firstDownloadedAt: { gte: range.from, lte: range.to } },
      select: { guideId: true },
    }),
    prisma.lead.count({
      where: { organizationId, createdAt: { gte: range.from, lte: range.to } },
    }),
    prisma.lead.count({
      where: {
        organizationId,
        primarySource: "guide",
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
  ]);

  const rows: GuideStatRow[] = guides.map((g) => {
    const s = stats.filter((x) => x.guideId === g.id);
    const r = requests.filter((x) => x.guideId === g.id);
    const views = s.reduce((a, x) => a + x.views, 0);
    const openDownloads = s.reduce((a, x) => a + x.downloads, 0);
    const downloaded = r.filter((x) => x.downloadCount > 0).length;
    const totalDownloads = r.reduce((a, x) => a + x.downloadCount, 0) + openDownloads;
    const leadMap = new Map<string, string>();
    for (const x of r) if (x.leadId && x.lead) leadMap.set(x.leadId, x.lead.stage);
    const stages = [...leadMap.values()];
    const newDownloads = firstDownloads.filter((x) => x.guideId === g.id).length + openDownloads;
    return {
      guideId: g.id,
      title: g.title,
      status: g.status,
      audience: g.audience,
      gated: g.gated,
      views,
      requests: r.length,
      downloaded,
      openDownloads,
      totalDownloads,
      requestRate: rate(r.length, views),
      downloadRate: rate(downloaded, r.length),
      leads: leadMap.size,
      reachedViewing: stages.filter((st) => REACHED_VIEWING.has(st)).length,
      won: stages.filter((st) => st === "WON").length,
      gatedViews: g.gated ? views : 0,
      openViews: g.gated ? 0 : views,
      newDownloads,
      conversionRate: g.gated ? rate(r.length, views) : rate(newDownloads, views),
      conversionKind: g.gated ? ("request" as const) : ("download" as const),
    };
  });

  const sum = (f: (r: GuideStatRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const totals = {
    views: sum((r) => r.views),
    requests: sum((r) => r.requests),
    downloaded: sum((r) => r.downloaded),
    openDownloads: sum((r) => r.openDownloads),
    totalDownloads: sum((r) => r.totalDownloads),
    requestRate: 0,
    downloadRate: 0,
    leads: sum((r) => r.leads),
    reachedViewing: sum((r) => r.reachedViewing),
    won: sum((r) => r.won),
    gatedViews: sum((r) => r.gatedViews),
    openViews: sum((r) => r.openViews),
    newDownloads: sum((r) => r.newDownloads),
    openDownloadRate: 0,
  };
  // Request rate only makes sense against form-first guides; open guides have no form to convert on.
  totals.requestRate = rate(
    rows.filter((r) => r.gated).reduce((a, r) => a + r.requests, 0),
    totals.gatedViews,
  );
  totals.downloadRate = rate(totals.downloaded, totals.requests);
  totals.openDownloadRate = rate(totals.openDownloads, totals.openViews);

  const byChannel = new Map<string, { requests: number; downloaded: number; leads: Map<string, string> }>();
  for (const x of requests) {
    const ch = channelLabel(x.utmSource, x.utmMedium, x.referrer);
    const row = byChannel.get(ch) ?? { requests: 0, downloaded: 0, leads: new Map<string, string>() };
    row.requests += 1;
    if (x.downloadCount > 0) row.downloaded += 1;
    if (x.leadId && x.lead) row.leads.set(x.leadId, x.lead.stage);
    byChannel.set(ch, row);
  }
  const channels: ChannelRow[] = [...byChannel.entries()]
    .map(([channel, v]) => ({
      channel,
      requests: v.requests,
      downloaded: v.downloaded,
      leads: v.leads.size,
      reachedViewing: [...v.leads.values()].filter((st) => REACHED_VIEWING.has(st)).length,
    }))
    .sort((a, b) => b.requests - a.requests || a.channel.localeCompare(b.channel));

  return {
    totals,
    guides: rows,
    channels,
    // With a filter on, "guide leads" means the leads behind the filtered guides' requests
    guideLeadShare: { guideLeads: guideIds ? totals.leads : guideLeadRows, allLeads },
  };
}

export { dayKey };
