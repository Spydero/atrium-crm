import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const shortlistsRouter = Router();

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

/** Public buyer-facing shortlist */
shortlistsRouter.get("/public/:token", async (req, res) => {
  const shortlist = await prisma.shortlist.findUnique({
    where: { token: req.params.token },
    include: {
      organization: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              priceAed: true,
              beds: true,
              baths: true,
              areaSqft: true,
              community: true,
              city: true,
              coverUrl: true,
              propertyType: true,
              description: true,
              lat: true,
              lng: true,
            },
          },
        },
      },
    },
  });
  if (!shortlist) return res.status(404).json({ error: "Not found" });

  await prisma.shortlist.update({
    where: { id: shortlist.id },
    data: { openCount: { increment: 1 } },
  });

  res.json(shortlist);
});

shortlistsRouter.use(requireAuth);

shortlistsRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  const list = await prisma.shortlist.findMany({
    where: { organizationId },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(list);
});

shortlistsRouter.post("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    title: z.string().min(1),
    clientName: z.string().optional().nullable(),
    listingIds: z.array(z.string()).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const shortlist = await prisma.shortlist.create({
    data: {
      organizationId,
      title: parsed.data.title,
      clientName: parsed.data.clientName ?? null,
      items: {
        create: parsed.data.listingIds.map((listingId, i) => ({
          listingId,
          sortOrder: i,
        })),
      },
    },
    include: { items: true },
  });

  res.status(201).json(shortlist);
});
