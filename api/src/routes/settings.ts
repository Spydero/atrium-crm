import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

const PORTALS = ["BAYUT", "PROPERTY_FINDER", "DUBIZZLE", "SKYLOOV"] as const;

settingsRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      currencyCode: true,
      currencyLabel: true,
      defaultCity: true,
      enabledPortals: true,
    },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json({
    ...org,
    availablePortals: PORTALS,
  });
});

settingsRouter.patch("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    name: z.string().min(1).optional(),
    currencyCode: z.string().min(1).max(8).optional(),
    currencyLabel: z.string().min(1).max(12).optional(),
    defaultCity: z.string().max(120).optional(),
    enabledPortals: z
      .array(z.enum(["BAYUT", "PROPERTY_FINDER", "DUBIZZLE", "SKYLOOV"]))
      .optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
      ...(parsed.data.currencyCode != null
        ? { currencyCode: parsed.data.currencyCode.toUpperCase() }
        : {}),
      ...(parsed.data.currencyLabel != null
        ? { currencyLabel: parsed.data.currencyLabel }
        : {}),
      ...(parsed.data.defaultCity != null
        ? { defaultCity: parsed.data.defaultCity }
        : {}),
      ...(parsed.data.enabledPortals != null
        ? { enabledPortals: parsed.data.enabledPortals }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      currencyCode: true,
      currencyLabel: true,
      defaultCity: true,
      enabledPortals: true,
    },
  });

  res.json({ ...org, availablePortals: PORTALS });
});
