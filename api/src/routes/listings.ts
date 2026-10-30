import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const listingBody = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  propertyType: z
    .enum(["APARTMENT", "VILLA", "TOWNHOUSE", "PENTHOUSE", "OFFICE", "LAND"])
    .optional(),
  status: z
    .enum(["DRAFT", "ACTIVE", "RESERVED", "SOLD", "WITHDRAWN"])
    .optional(),
  priceAed: z.coerce.number().int().positive(),
  beds: z.coerce.number().int().min(0).optional(),
  baths: z.coerce.number().int().min(0).optional(),
  areaSqft: z.coerce.number().int().min(0).optional(),
  community: z.string().min(1),
  building: z.string().optional().nullable(),
  city: z.string().optional(),
  address: z.string().optional().nullable(),
  coverUrl: z.string().optional().nullable(),
  photoUrls: z.array(z.string()).optional(),
});

export const listingsRouter = Router();
listingsRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

listingsRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const {
    q,
    minPrice,
    maxPrice,
    beds,
    community,
    status,
    propertyType,
    portal,
  } = req.query;

  const listings = await prisma.listing.findMany({
    where: {
      organizationId,
      ...(q
        ? {
            OR: [
              { title: { contains: String(q), mode: "insensitive" } },
              { community: { contains: String(q), mode: "insensitive" } },
              { building: { contains: String(q), mode: "insensitive" } },
            ],
          }
        : {}),
      ...(minPrice ? { priceAed: { gte: Number(minPrice) } } : {}),
      ...(maxPrice
        ? { priceAed: { ...(minPrice ? { gte: Number(minPrice) } : {}), lte: Number(maxPrice) } }
        : {}),
      ...(beds ? { beds: { gte: Number(beds) } } : {}),
      ...(community
        ? { community: { contains: String(community), mode: "insensitive" } }
        : {}),
      ...(status ? { status: String(status) as never } : {}),
      ...(propertyType ? { propertyType: String(propertyType) as never } : {}),
      ...(portal
        ? {
            portals: {
              some: {
                portal: String(portal) as never,
                status: { in: ["LIVE", "PENDING"] },
              },
            },
          }
        : {}),
    },
    include: { portals: true },
    orderBy: { updatedAt: "desc" },
  });

  res.json(listings);
});

listingsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, organizationId: organizationId ?? undefined },
    include: { portals: true, leads: { take: 10, orderBy: { createdAt: "desc" } } },
  });
  if (!listing) return res.status(404).json({ error: "Not found" });
  res.json(listing);
});

listingsRouter.post("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const parsed = listingBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const data = parsed.data;
  const listing = await prisma.listing.create({
    data: {
      organizationId,
      title: data.title,
      description: data.description ?? "",
      propertyType: data.propertyType ?? "APARTMENT",
      status: data.status ?? "DRAFT",
      priceAed: data.priceAed,
      beds: data.beds ?? 0,
      baths: data.baths ?? 0,
      areaSqft: data.areaSqft ?? 0,
      community: data.community,
      building: data.building ?? null,
      city: data.city ?? "",
      address: data.address ?? null,
      coverUrl: data.coverUrl ?? null,
      photoUrls: data.photoUrls ?? [],
      portals: {
        create: [
          { portal: "BAYUT", status: "OFF" },
          { portal: "PROPERTY_FINDER", status: "OFF" },
          { portal: "DUBIZZLE", status: "OFF" },
          { portal: "SKYLOOV", status: "OFF" },
        ],
      },
    },
    include: { portals: true },
  });
  res.status(201).json(listing);
});

listingsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  const existing = await prisma.listing.findFirst({
    where: { id: req.params.id, organizationId: organizationId ?? undefined },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = listingBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const listing = await prisma.listing.update({
    where: { id: existing.id },
    data: parsed.data,
    include: { portals: true },
  });
  res.json(listing);
});

listingsRouter.post(
  "/:id/photos",
  upload.single("photo"),
  async (req: AuthedRequest, res) => {
    const organizationId = orgId(req);
    const existing = await prisma.listing.findFirst({
      where: { id: req.params.id, organizationId: organizationId ?? undefined },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!req.file) return res.status(400).json({ error: "No file" });

    const url = `http://localhost:${process.env.PORT || 4000}/uploads/${req.file.filename}`;
    const listing = await prisma.listing.update({
      where: { id: existing.id },
      data: {
        coverUrl: existing.coverUrl ?? url,
        photoUrls: [...existing.photoUrls, url],
      },
      include: { portals: true },
    });
    res.json(listing);
  },
);

listingsRouter.post("/:id/publish", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  const schema = z.object({
    portal: z.enum(["BAYUT", "PROPERTY_FINDER", "DUBIZZLE", "SKYLOOV"]),
    status: z.enum(["OFF", "PENDING", "LIVE", "REJECTED"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, organizationId: organizationId ?? undefined },
  });
  if (!listing) return res.status(404).json({ error: "Not found" });

  // Mock adapter: PENDING briefly then LIVE (we set requested status directly for demo control)
  const portal = await prisma.listingPortalStatus.upsert({
    where: {
      listingId_portal: { listingId: listing.id, portal: parsed.data.portal },
    },
    create: {
      listingId: listing.id,
      portal: parsed.data.portal,
      status: parsed.data.status === "LIVE" ? "PENDING" : parsed.data.status,
      externalId:
        parsed.data.status === "OFF"
          ? null
          : `MOCK-${parsed.data.portal.slice(0, 3)}-${listing.id.slice(-6)}`,
    },
    update: {
      status: parsed.data.status === "LIVE" ? "PENDING" : parsed.data.status,
      externalId:
        parsed.data.status === "OFF"
          ? null
          : `MOCK-${parsed.data.portal.slice(0, 3)}-${listing.id.slice(-6)}`,
    },
  });

  if (parsed.data.status === "LIVE") {
    setTimeout(async () => {
      await prisma.listingPortalStatus.update({
        where: { id: portal.id },
        data: { status: "LIVE" },
      });
    }, 1200);
  }

  const fresh = await prisma.listing.findUnique({
    where: { id: listing.id },
    include: { portals: true },
  });
  res.json(fresh);
});
