import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

export const bootstrapRouter = Router();
bootstrapRouter.use(requireAuth);

bootstrapRouter.post("/organization", async (req: AuthedRequest, res) => {
  const user = req.session!.user as {
    id: string;
    organizationId?: string | null;
  };
  if (user.organizationId) {
    return res.json({ organizationId: user.organizationId, existing: true });
  }

  const parsed = z
    .object({ name: z.string().min(2), slug: z.string().min(2).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const slug =
    parsed.data.slug ||
    parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug: `${slug}-${Date.now().toString(36)}`,
      portalBudgets: {
        create: [
          { portal: "BAYUT", monthlySpendAed: 0 },
          { portal: "PROPERTY_FINDER", monthlySpendAed: 0 },
          { portal: "DUBIZZLE", monthlySpendAed: 0 },
          { portal: "SKYLOOV", monthlySpendAed: 0 },
        ],
      },
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { organizationId: org.id, role: "owner" },
  });

  res.status(201).json({ organizationId: org.id, existing: false });
});
