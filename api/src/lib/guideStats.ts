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
};

export type GuideStats = {
  totals: Omit<GuideStatRow, "guideId" | "title" | "status" | "audience" | "gated">;
  guides: GuideStatRow[];
  channels: { channel: string; requests: number }[];
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

  const [stats, requests, allLeads, guideLeadRows] = await Promise.all([
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
    prisma.lead.count({
      where: { organizationId, createdAt: { gte: range.from, lte: range.to } },
    }),
    prisma.lead.count({
      where: {
        organizationId,
        primarySource: "GUIDE",
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
  };
  totals.requestRate = rate(totals.requests, totals.views);
  totals.downloadRate = rate(totals.downloaded, totals.requests);

  const byChannel = new Map<string, number>();
  for (const x of requests) {
    const ch = channelLabel(x.utmSource, x.utmMedium, x.referrer);
    byChannel.set(ch, (byChannel.get(ch) || 0) + 1);
  }
  const channels = [...byChannel.entries()]
    .map(([channel, n]) => ({ channel, requests: n }))
    .sort((a, b) => b.requests - a.requests);

  return {
    totals,
    guides: rows,
    channels,
    guideLeadShare: { guideLeads: guideLeadRows, allLeads },
  };
}

export { dayKey };
