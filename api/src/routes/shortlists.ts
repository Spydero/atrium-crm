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
      organization: { select: { name: true, status: true, currencyLabel: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          listing: {
            select: {
              id: true,
              organizationId: true,
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
  if (!shortlist || shortlist.organization.status === "SUSPENDED") return res.status(404).json({ error: "Not found" });

  await prisma.shortlist.update({
    where: { id: shortlist.id },
    data: { openCount: { increment: 1 } },
  });

  const items = shortlist.items
    .filter(item => item.listing.organizationId === shortlist.organizationId)
    .map(({ listing: { organizationId: _organizationId, ...listing } }) => ({ listing }));
  res.json({
    title: shortlist.title,
    clientName: shortlist.clientName,
    organization: { name: shortlist.organization.name, currencyLabel: shortlist.organization.currencyLabel },
    items,
  });
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
    title: z.string().trim().min(1).max(120),
    clientName: z.string().trim().max(120).optional().nullable(),
    listingIds: z.array(z.string().min(1)).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a title and select at least one property." });

  const listingIds = [...new Set(parsed.data.listingIds)];
  const ownedCount = await prisma.listing.count({ where: { id: { in: listingIds }, organizationId } });
  if (ownedCount !== listingIds.length) {
    return res.status(400).json({ error: "One or more listings are not in your organization" });
  }

  const shortlist = await prisma.shortlist.create({
    data: {
      organizationId,
      title: parsed.data.title,
      clientName: parsed.data.clientName || null,
      items: {
        create: listingIds.map((listingId, i) => ({
          listingId,
          sortOrder: i,
        })),
      },
    },
    include: { items: true, _count: { select: { items: true } } },
  });

  res.status(201).json(shortlist);
});
