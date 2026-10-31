import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { csvFilename, toCsv } from "../lib/csv.js";
import { previousRange, resolveDateRange } from "../lib/dateRange.js";
import { allowedGroups, buildTrend, pickGroup, summarize, totalOf, type TrendItem } from "../lib/trendBuckets.js";
import { computeGuideStats } from "../lib/guideStats.js";
import { channelLabel, checkImage, checkPdf, MAX_PDF_BYTES, slugify, uniqueSlug } from "../lib/guideTools.js";
import { deleteGuideFile, downloadName, guideFilePath, saveGuideFile } from "../lib/guideStorage.js";

export const guidesRouter = Router();
guidesRouter.use(requireAuth);

const coverDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(coverDir, { recursive: true });

const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES } });

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

const STATUS_ORDER = { PUBLISHED: 0, DRAFT: 1, ARCHIVED: 2 } as const;
const AUDIENCE = z.enum(["BUYER", "SELLER", "INVESTOR", "RENTER", "GENERAL"]);
const STATUS = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

const fields = {
  title: z.string().trim().min(3).max(120),
  subtitle: z.string().trim().max(200),
  audience: AUDIENCE,
  summary: z.string().trim().max(1200),
  benefits: z.array(z.string().trim().min(1).max(160)).max(10),
  gated: z.boolean(),
  ownerId: z.string().min(1).nullable(),
  permitNumber: z.string().trim().max(60).nullable(),
  ctaText: z.string().trim().max(200),
  pageCount: z.number().int().min(1).max(500).nullable(),
  coverUrl: z.string().max(500).nullable(),
};

async function ownerOk(organizationId: string, ownerId: string | null | undefined) {
  if (!ownerId) return true;
  return !!(await prisma.user.findFirst({ where: { id: ownerId, organizationId }, select: { id: true } }));
}

function present(g: {
  filePath: string | null;
  [k: string]: unknown;
}) {
  const { filePath, ...rest } = g;
  return { ...rest, hasFile: !!filePath };
}

const SORTS = ["status", "newest", "title", "views", "requests", "downloads", "conversion", "leads"] as const;
type SortKey = (typeof SORTS)[number];

/** Library filters shared by the list and the trend chart: q, status, audience, access (gated | open). */
async function filteredGuides(organizationId: string, query: Record<string, unknown>) {
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 80) : "";
  const status = STATUS.safeParse(query.status);
  const audience = AUDIENCE.safeParse(query.audience);
  const access = query.access === "gated" || query.access === "open" ? query.access : null;
  const active = !!q || status.success || audience.success || !!access;
  const guides = await prisma.guide.findMany({
    where: {
      organizationId,
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] } : {}),
      ...(status.success ? { status: status.data } : {}),
      ...(audience.success ? { audience: audience.data } : {}),
      ...(access ? { gated: access === "gated" } : {}),
    },
    include: { owner: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return { guides, active, ids: active ? guides.map((g) => g.id) : undefined };
}

/** Library with funnel numbers for the chosen date range, filters and sort. */
guidesRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const range = resolveDateRange(req.query);
  const sort: SortKey = SORTS.includes(req.query.sort as SortKey) ? (req.query.sort as SortKey) : "status";
  const dir = req.query.dir === "asc" ? 1 : req.query.dir === "desc" ? -1 : sort === "title" ? 1 : -1;
  const { guides, active, ids } = await filteredGuides(organizationId, req.query);
  const [stats, previous, totalGuides] = await Promise.all([
    computeGuideStats(organizationId, range, ids),
    computeGuideStats(organizationId, previousRange(range), ids),
    prisma.guide.count({ where: { organizationId } }),
  ]);

  const statOf = (id: string) => stats.guides.find((x) => x.guideId === id) ?? null;
  const val = (g: (typeof guides)[number]) => {
    const st = statOf(g.id);
    switch (sort) {
      case "views": return st?.views ?? 0;
      case "requests": return st?.requests ?? 0;
      case "downloads": return st?.newDownloads ?? 0;
      case "conversion": return st?.conversionRate ?? 0;
      case "leads": return st?.leads ?? 0;
      case "newest": return g.createdAt.getTime();
      default: return 0;
    }
  };
  const ordered = [...guides];
  if (sort === "status") {
    ordered.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  } else if (sort === "title") {
    ordered.sort((a, b) => dir * a.title.localeCompare(b.title));
  } else {
    ordered.sort((a, b) => dir * (val(a) - val(b)) || a.title.localeCompare(b.title));
  }
  const rows = ordered.map((g) => ({ ...present(g), stats: statOf(g.id) }));

  res.json({
    range: { preset: range.preset, from: range.fromKey, to: range.toKey, label: range.label, days: range.days },
    filters: { active, shown: rows.length, total: totalGuides },
    sort: { key: sort, dir: dir === 1 ? "asc" : "desc" },
    totals: stats.totals,
    previous: previous.totals,
    channels: stats.channels,
    guideLeadShare: stats.guideLeadShare,
    guides: rows,
  });
});

const TREND_METRICS = ["views", "requests", "downloads"] as const;
type TrendMetricKey = (typeof TREND_METRICS)[number];

async function guideTrendItems(
  guideIds: string[],
  titles: Map<string, string>,
  metric: TrendMetricKey,
  from: Date,
  to: Date,
  fromKey: string,
  toKey: string,
): Promise<TrendItem[]> {
  if (!guideIds.length) return [];
  const daily = async (field: "views" | "downloads") => {
    const rows = await prisma.guideDailyStat.findMany({
      where: { guideId: { in: guideIds }, date: { gte: fromKey, lte: toKey } },
    });
    return rows
      .filter((r) => r[field] > 0)
      .map((r) => {
        const [y, m, d] = r.date.split("-").map(Number);
        return { at: new Date(y, m - 1, d, 12), n: r[field], key: titles.get(r.guideId) ?? "Guide" };
      });
  };
  if (metric === "views") return daily("views");
  if (metric === "requests") {
    const rows = await prisma.guideRequest.findMany({
      where: { guideId: { in: guideIds }, createdAt: { gte: from, lte: to } },
      select: { createdAt: true, utmSource: true, utmMedium: true, referrer: true },
    });
    return rows.map((r) => ({ at: r.createdAt, key: channelLabel(r.utmSource, r.utmMedium, r.referrer) }));
  }
  const first = await prisma.guideRequest.findMany({
    where: { guideId: { in: guideIds }, firstDownloadedAt: { gte: from, lte: to } },
    select: { firstDownloadedAt: true, guideId: true },
  });
  return [
    ...first.map((r) => ({ at: r.firstDownloadedAt as Date, key: titles.get(r.guideId) ?? "Guide" })),
    ...(await daily("downloads")),
  ];
}

/**
 * Over-time data for the Guides chart. Same query as the library (range, q, status, audience, access)
 * plus metric=views|requests|downloads, group=day|week|month, compare=1.
 */
guidesRouter.get("/trend", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const metric: TrendMetricKey = TREND_METRICS.includes(req.query.metric as TrendMetricKey)
    ? (req.query.metric as TrendMetricKey)
    : "requests";
  const range = resolveDateRange(req.query);
  const group = pickGroup(req.query.group, range.days);
  const compare = req.query.compare === "1" || req.query.compare === "true";
  const { guides } = await filteredGuides(organizationId, req.query);
  const ids = guides.map((g) => g.id);
  const titles = new Map(guides.map((g) => [g.id, g.title]));

  const items = await guideTrendItems(ids, titles, metric, range.from, range.to, range.fromKey, range.toKey);
  let prevItems: TrendItem[] | null = null;
  if (compare) {
    const p = previousRange(range);
    prevItems = await guideTrendItems(ids, titles, metric, p.from, p.to, p.fromKey, p.toKey);
  }
  const buckets = buildTrend(range, group, items, prevItems);
  const totals = summarize(buckets, prevItems ? totalOf(prevItems) : null, null);
  res.json({
    metric,
    group,
    allowedGroups: allowedGroups(range.days),
    compare,
    range: { preset: range.preset, from: range.fromKey, to: range.toKey, label: range.label, days: range.days },
    totals,
    buckets,
  });
});

guidesRouter.get("/:id", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const g = await prisma.guide.findFirst({
    where: { id: String(req.params.id), organizationId },
    include: { owner: { select: { id: true, name: true } } },
  });
  if (!g) return res.status(404).json({ error: "Guide not found" });
  const range = resolveDateRange({ range: "90d", ...req.query });
  const stats = await computeGuideStats(organizationId, range, [g.id]);
  res.json({ ...present(g), stats: stats.guides[0] ?? null, channels: stats.channels });
});

guidesRouter.post("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const parsed = z
    .object({
      title: fields.title,
      subtitle: fields.subtitle.optional(),
      audience: fields.audience.optional(),
      summary: fields.summary.optional(),
      benefits: fields.benefits.optional(),
      gated: fields.gated.optional(),
      ownerId: fields.ownerId.optional(),
      permitNumber: fields.permitNumber.optional(),
      ctaText: fields.ctaText.optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const d = parsed.data;
  if (!(await ownerOk(organizationId, d.ownerId))) {
    return res.status(400).json({ error: "That agent is not in your organization" });
  }
  const taken = (
    await prisma.guide.findMany({ where: { organizationId }, select: { slug: true } })
  ).map((g) => g.slug);
  const slug = uniqueSlug(slugify(d.title), taken);
  const guide = await prisma.guide.create({
    data: {
      organizationId,
      slug,
      title: d.title,
      subtitle: d.subtitle ?? "",
      audience: d.audience ?? "GENERAL",
      summary: d.summary ?? "",
      benefits: d.benefits ?? [],
      gated: d.gated ?? true,
      ownerId: d.ownerId ?? req.session?.user.id ?? null,
      permitNumber: d.permitNumber ?? null,
      ctaText: d.ctaText ?? "",
    },
  });
  res.status(201).json(present(guide));
});

guidesRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const existing = await prisma.guide.findFirst({ where: { id: String(req.params.id), organizationId } });
  if (!existing) return res.status(404).json({ error: "Guide not found" });
  const parsed = z.object(fields).partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const d = parsed.data;
  if (d.ownerId !== undefined && !(await ownerOk(organizationId, d.ownerId))) {
    return res.status(400).json({ error: "That agent is not in your organization" });
  }
  const guide = await prisma.guide.update({ where: { id: existing.id }, data: d });
  res.json(present(guide));
});

/** Draft, published or archived. Publishing needs a PDF. */
guidesRouter.post("/:id/status", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const parsed = z.object({ status: STATUS }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const g = await prisma.guide.findFirst({ where: { id: String(req.params.id), organizationId } });
  if (!g) return res.status(404).json({ error: "Guide not found" });
  const next = parsed.data.status;
  if (next === "PUBLISHED") {
    if (!g.filePath || !guideFilePath(g.filePath)) {
      return res.status(400).json({ error: "Upload the PDF before publishing" });
    }
    if (!g.summary.trim()) return res.status(400).json({ error: "Add a short summary before publishing" });
  }
  const guide = await prisma.guide.update({
    where: { id: g.id },
    data: {
      status: next,
      ...(next === "PUBLISHED" && !g.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });
  res.json(present(guide));
});

guidesRouter.post("/:id/file", memory.single("file"), async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const g = await prisma.guide.findFirst({ where: { id: String(req.params.id), organizationId } });
  if (!g) return res.status(404).json({ error: "Guide not found" });
  if (!req.file) return res.status(400).json({ error: "Choose a PDF file" });
  const check = checkPdf(req.file.buffer);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const key = saveGuideFile(req.file.buffer);
  const originalName = path.basename(req.file.originalname || "guide.pdf").slice(0, 120);
  const guide = await prisma.guide.update({
    where: { id: g.id },
    data: {
      filePath: key,
      fileName: originalName,
      fileBytes: req.file.size,
      pageCount: check.pageCount ?? g.pageCount,
      version: g.filePath ? { increment: 1 } : g.version,
    },
  });
  deleteGuideFile(g.filePath);
  res.json(present(guide));
});

guidesRouter.post("/:id/cover", memory.single("cover"), async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const g = await prisma.guide.findFirst({ where: { id: String(req.params.id), organizationId } });
  if (!g) return res.status(404).json({ error: "Guide not found" });
  if (!req.file) return res.status(400).json({ error: "Choose an image" });
  const check = checkImage(req.file.buffer);
  if (!check.ok) return res.status(400).json({ error: check.error });
  const name = `guide-cover-${crypto.randomBytes(8).toString("hex")}.${check.ext}`;
  fs.writeFileSync(path.join(coverDir, name), req.file.buffer);
  const url = `http://localhost:${process.env.PORT || 4000}/uploads/${name}`;
  const guide = await prisma.guide.update({ where: { id: g.id }, data: { coverUrl: url } });
  res.json(present(guide));
});

/** Agents preview the stored PDF. Not counted as a download. */
guidesRouter.get("/:id/file", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const g = await prisma.guide.findFirst({ where: { id: String(req.params.id), organizationId } });
  const file = guideFilePath(g?.filePath);
  if (!g || !file) return res.status(404).json({ error: "No PDF uploaded yet" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName(g.title)}"`);
  fs.createReadStream(file).pipe(res);
});

guidesRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const g = await prisma.guide.findFirst({
    where: { id: String(req.params.id), organizationId },
    include: { _count: { select: { requests: true } } },
  });
  if (!g) return res.status(404).json({ error: "Guide not found" });
  if (g.status === "PUBLISHED") return res.status(400).json({ error: "Archive the guide before deleting it" });
  if (g._count.requests > 0) {
    return res.status(400).json({ error: "This guide has requests. Archive it instead so history is kept" });
  }
  await prisma.guide.delete({ where: { id: g.id } });
  deleteGuideFile(g.filePath);
  res.json({ ok: true });
});

const requestSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  leadId: true,
  consentMarketing: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  referrer: true,
  downloadCount: true,
  firstDownloadedAt: true,
  lastDownloadedAt: true,
  createdAt: true,
} as const;

guidesRouter.get("/:id/requests", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const g = await prisma.guide.findFirst({ where: { id: String(req.params.id), organizationId } });
  if (!g) return res.status(404).json({ error: "Guide not found" });
  const rows = await prisma.guideRequest.findMany({
    where: { guideId: g.id },
    select: { ...requestSelect, lead: { select: { name: true, stage: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(rows.map((r) => ({ ...r, channel: channelLabel(r.utmSource, r.utmMedium, r.referrer) })));
});

guidesRouter.get("/:id/requests.csv", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const g = await prisma.guide.findFirst({ where: { id: String(req.params.id), organizationId } });
  if (!g) return res.status(404).json({ error: "Guide not found" });
  const rows = await prisma.guideRequest.findMany({
    where: { guideId: g.id },
    select: { ...requestSelect, lead: { select: { stage: true } } },
    orderBy: { createdAt: "desc" },
  });
  const csv = toCsv(
    ["Requested", "Name", "Email", "Phone", "Marketing consent", "Downloaded", "Downloads", "Channel", "Source", "Medium", "Campaign", "Lead stage"],
    rows.map((r) => [
      r.createdAt,
      r.name,
      r.email,
      r.phone,
      r.consentMarketing ? "Yes" : "No",
      r.downloadCount > 0 ? "Yes" : "No",
      r.downloadCount,
      channelLabel(r.utmSource, r.utmMedium, r.referrer),
      r.utmSource,
      r.utmMedium,
      r.utmCampaign,
      r.lead?.stage ?? "",
    ]),
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${csvFilename(`guide-${g.slug}-requests`)}"`);
  res.send(csv);
});
