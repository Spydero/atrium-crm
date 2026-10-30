import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { csvFilename, toCsv } from "../lib/csv.js";
import { resolveDateRange } from "../lib/dateRange.js";
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

/** Library with funnel numbers for the chosen date range. */
guidesRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const range = resolveDateRange(req.query);
  const [guides, stats] = await Promise.all([
    prisma.guide.findMany({
      where: { organizationId },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    computeGuideStats(organizationId, range),
  ]);
  res.json({
    range: { preset: range.preset, from: range.fromKey, to: range.toKey, label: range.label },
    totals: stats.totals,
    channels: stats.channels,
    guideLeadShare: stats.guideLeadShare,
    guides: [...guides]
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      .map((g) => ({
        ...present(g),
        stats: stats.guides.find((s) => s.guideId === g.id) ?? null,
      })),
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
