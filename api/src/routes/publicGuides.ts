import { Router } from "express";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { recordGuideRequest } from "../lib/guideService.js";
import { guideFilePath, downloadName } from "../lib/guideStorage.js";
import {
  cleanUtm,
  consentWording,
  dayKey,
  hashIp,
  RateLimiter,
} from "../lib/guideTools.js";

/** Public, no login. The organization always comes from the URL slug, never from the client. */
export const publicGuidesRouter = Router();

export const requestLimiter = new RateLimiter(10, 10 * 60_000); // per ip and guide
export const emailLimiter = new RateLimiter(4, 10 * 60_000); // per email and guide

const secret = () => process.env.BETTER_AUTH_SECRET || "atrium";

const publicOrg = {
  name: true,
  slug: true,
  privacyUrl: true,
  licenseLabel: true,
  licenseNumber: true,
} as const;

const publicGuide = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  audience: true,
  summary: true,
  benefits: true,
  coverUrl: true,
  pageCount: true,
  gated: true,
  permitNumber: true,
  ctaText: true,
  version: true,
  publishedAt: true,
  updatedAt: true,
  fileBytes: true,
  owner: { select: { name: true } },
} as const;

publicGuidesRouter.get("/guides/:orgSlug", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { slug: String(req.params.orgSlug) },
    select: {
      ...publicOrg,
      guides: {
        where: { status: "PUBLISHED" },
        select: publicGuide,
        orderBy: { publishedAt: "desc" },
      },
    },
  });
  if (!org) return res.status(404).json({ error: "Not found" });
  const { guides, ...organization } = org;
  res.json({ organization, guides });
});

publicGuidesRouter.get("/guides/:orgSlug/:guideSlug", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { slug: String(req.params.orgSlug) },
    select: publicOrg,
  });
  if (!org) return res.status(404).json({ error: "Not found" });
  const guide = await prisma.guide.findFirst({
    where: {
      organization: { slug: org.slug },
      slug: String(req.params.guideSlug),
      status: "PUBLISHED",
    },
    select: publicGuide,
  });
  if (!guide) return res.status(404).json({ error: "Not found" });
  res.json({
    organization: org,
    guide,
    consentText: consentWording(org.name),
  });
});

/** Count one page view. Daily totals only, no personal data. */
publicGuidesRouter.post("/guides/:orgSlug/:guideSlug/view", async (req, res) => {
  const guide = await prisma.guide.findFirst({
    where: {
      organization: { slug: String(req.params.orgSlug) },
      slug: String(req.params.guideSlug),
      status: "PUBLISHED",
    },
    select: { id: true },
  });
  if (!guide) return res.status(404).json({ error: "Not found" });
  const date = dayKey(new Date());
  await prisma.guideDailyStat.upsert({
    where: { guideId_date: { guideId: guide.id, date } },
    create: { guideId: guide.id, date, views: 1 },
    update: { views: { increment: 1 } },
  });
  res.json({ ok: true });
});

const requestBody = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email address").max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || v.replace(/\D/g, "").length >= 7, "Enter a valid phone number"),
  consentMarketing: z.boolean().optional().default(false),
  // honeypot: real people never fill this in
  website: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  referrer: z.string().optional(),
});

publicGuidesRouter.post("/guides/:orgSlug/:guideSlug/request", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { slug: String(req.params.orgSlug) },
    select: { name: true, slug: true },
  });
  if (!org) return res.status(404).json({ error: "Not found" });
  const guide = await prisma.guide.findFirst({
    where: { organization: { slug: org.slug }, slug: String(req.params.guideSlug), status: "PUBLISHED" },
    select: { id: true, organizationId: true, title: true, ownerId: true, filePath: true },
  });
  if (!guide || !guideFilePath(guide.filePath)) return res.status(404).json({ error: "Not found" });

  const parsed = requestBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Check your details",
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;

  // Bots fill hidden fields. Pretend it worked, store nothing.
  if (d.website && d.website.trim() !== "") {
    return res.status(201).json({ token: "bot" });
  }

  const ipHash = hashIp(req.ip, secret());
  const ipKey = `${guide.id}:${ipHash ?? "?"}`;
  const mailKey = `${guide.id}:${d.email.toLowerCase()}`;
  if (!requestLimiter.allow(ipKey) || !emailLimiter.allow(mailKey)) {
    return res.status(429).json({ error: "Too many requests. Please try again in a few minutes." });
  }

  const utm = cleanUtm(d);
  const result = await recordGuideRequest(
    guide,
    org,
    {
      name: d.name,
      email: d.email,
      phone: d.phone,
      consentMarketing: d.consentMarketing,
      ...utm,
      ipHash,
    },
  );
  res.status(201).json({ token: result.request.token });
});

/** Thank-you page data for a personal link. */
publicGuidesRouter.get("/guide-requests/:token", async (req, res) => {
  const r = await prisma.guideRequest.findUnique({
    where: { token: String(req.params.token) },
    select: {
      name: true,
      guide: {
        select: {
          ...publicGuide,
          status: true,
          organization: { select: publicOrg },
        },
      },
    },
  });
  if (!r || r.guide.status !== "PUBLISHED") return res.status(404).json({ error: "Not found" });
  const { organization, status: _s, ...guide } = r.guide;
  res.json({ firstName: r.name.split(/\s+/)[0], organization, guide });
});

/** Send a PDF to the stream and set safe headers. */
function sendPdf(res: import("express").Response, file: string, title: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName(title)}"`);
  fs.createReadStream(file).pipe(res);
}

/** Personal link: counts the download against the request. Links do not expire. */
publicGuidesRouter.get("/guide-files/:token", async (req, res) => {
  const r = await prisma.guideRequest.findUnique({
    where: { token: String(req.params.token) },
    select: { id: true, guide: { select: { title: true, status: true, filePath: true } } },
  });
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.guide.status !== "PUBLISHED") {
    return res.status(410).json({ error: "This guide is no longer available" });
  }
  const file = guideFilePath(r.guide.filePath);
  if (!file) return res.status(404).json({ error: "Not found" });
  const now = new Date();
  await prisma.$executeRaw`UPDATE "GuideRequest" SET "downloadCount" = "downloadCount" + 1, "lastDownloadedAt" = ${now}, "firstDownloadedAt" = COALESCE("firstDownloadedAt", ${now}) WHERE id = ${r.id}`;
  sendPdf(res, file, r.guide.title);
});

/** Open (ungated) guides can be downloaded without a form. Counted in daily totals. */
publicGuidesRouter.get("/guides/:orgSlug/:guideSlug/file", async (req, res) => {
  const guide = await prisma.guide.findFirst({
    where: {
      organization: { slug: String(req.params.orgSlug) },
      slug: String(req.params.guideSlug),
      status: "PUBLISHED",
    },
    select: { id: true, title: true, gated: true, filePath: true },
  });
  if (!guide) return res.status(404).json({ error: "Not found" });
  if (guide.gated) return res.status(403).json({ error: "Enter your details to get this guide" });
  const file = guideFilePath(guide.filePath);
  if (!file) return res.status(404).json({ error: "Not found" });
  const date = dayKey(new Date());
  await prisma.guideDailyStat.upsert({
    where: { guideId_date: { guideId: guide.id, date } },
    create: { guideId: guide.id, date, downloads: 1 },
    update: { downloads: { increment: 1 } },
  });
  sendPdf(res, file, guide.title);
});
