import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import {
  ensureOrgChannels,
  isSystemKey,
  listOrgChannels,
  normalizeChannelKey,
} from "../lib/channels.js";
import { requireOrgRole } from "../middleware/requireOrgRole.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

function orgId(req: AuthedRequest) {
  return (req.session?.user as { organizationId?: string | null }).organizationId;
}

settingsRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  await ensureOrgChannels(organizationId);

  const [org, channels] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        currencyCode: true,
        currencyLabel: true,
        defaultCity: true,
        privacyUrl: true,
        licenseLabel: true,
        licenseNumber: true,
      },
    }),
    listOrgChannels(organizationId),
  ]);
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const enabledPortals = channels.filter((c) => c.kind === "PORTAL" && c.enabled).map((c) => c.key);
  res.json({
    ...org,
    channels,
    /** @deprecated use channels where kind=PORTAL */
    enabledPortals,
  });
});

settingsRouter.patch("/", requireOrgRole("admin"), async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    name: z.string().min(1).optional(),
    currencyCode: z.string().min(1).max(8).optional(),
    currencyLabel: z.string().min(1).max(12).optional(),
    defaultCity: z.string().max(120).optional(),
    privacyUrl: z
      .string()
      .trim()
      .max(300)
      .refine((v) => v === "" || /^https?:\/\//i.test(v), "Use a full link starting with http:// or https://")
      .optional(),
    licenseLabel: z.string().trim().min(1).max(40).optional(),
    licenseNumber: z.string().trim().max(60).optional(),
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
      ...(parsed.data.privacyUrl != null ? { privacyUrl: parsed.data.privacyUrl || null } : {}),
      ...(parsed.data.licenseLabel != null ? { licenseLabel: parsed.data.licenseLabel } : {}),
      ...(parsed.data.licenseNumber != null
        ? { licenseNumber: parsed.data.licenseNumber || null }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      currencyCode: true,
      currencyLabel: true,
      defaultCity: true,
      privacyUrl: true,
      licenseLabel: true,
      licenseNumber: true,
    },
  });

  const channels = await listOrgChannels(organizationId);
  res.json({
    ...org,
    channels,
    enabledPortals: channels.filter((c) => c.kind === "PORTAL" && c.enabled).map((c) => c.key),
  });
});

settingsRouter.get("/channels", async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });
  await ensureOrgChannels(organizationId);
  res.json({ channels: await listOrgChannels(organizationId) });
});

settingsRouter.post("/channels", requireOrgRole("admin"), async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const schema = z.object({
    label: z.string().trim().min(1).max(60),
    key: z.string().trim().min(1).max(40).optional(),
    kind: z.enum(["PORTAL", "ADS", "OTHER"]).default("OTHER"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const key = normalizeChannelKey(parsed.data.key || parsed.data.label);
  if (isSystemKey(key)) {
    return res.status(400).json({ error: "That key is reserved for a system channel" });
  }

  const existing = await prisma.orgChannel.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (existing) return res.status(409).json({ error: "A channel with that key already exists" });

  const maxSort = await prisma.orgChannel.aggregate({
    where: { organizationId },
    _max: { sortOrder: true },
  });

  const channel = await prisma.orgChannel.create({
    data: {
      organizationId,
      key,
      label: parsed.data.label,
      kind: parsed.data.kind,
      enabled: true,
      sortOrder: (maxSort._max.sortOrder ?? 400) + 10,
    },
  });
  res.status(201).json(channel);
});

settingsRouter.patch("/channels/:key", requireOrgRole("admin"), async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const key = normalizeChannelKey(String(req.params.key));
  const schema = z.object({
    label: z.string().trim().min(1).max(60).optional(),
    enabled: z.boolean().optional(),
    kind: z.enum(["PORTAL", "ADS", "OTHER"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const existing = await prisma.orgChannel.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (!existing) return res.status(404).json({ error: "Channel not found" });

  if (existing.kind === "SYSTEM" && parsed.data.kind) {
    return res.status(400).json({ error: "System channels cannot change kind" });
  }

  const channel = await prisma.orgChannel.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.label != null ? { label: parsed.data.label } : {}),
      ...(parsed.data.enabled != null ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.kind != null && existing.kind !== "SYSTEM"
        ? { kind: parsed.data.kind }
        : {}),
    },
  });
  res.json(channel);
});

settingsRouter.delete("/channels/:key", requireOrgRole("admin"), async (req: AuthedRequest, res) => {
  const organizationId = orgId(req);
  if (!organizationId) return res.status(400).json({ error: "No organization" });

  const key = normalizeChannelKey(String(req.params.key));
  if (isSystemKey(key)) {
    return res.status(400).json({ error: "System channels cannot be deleted" });
  }

  const existing = await prisma.orgChannel.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (!existing) return res.status(404).json({ error: "Channel not found" });

  const [leadCount, eventCount, spendCount, portalCount] = await Promise.all([
    prisma.lead.count({ where: { organizationId, primarySource: key } }),
    prisma.leadSourceEvent.count({ where: { source: key, lead: { organizationId } } }),
    prisma.sourceSpend.count({ where: { organizationId, source: key } }),
    prisma.listingPortalStatus.count({
      where: { portal: key, listing: { organizationId } },
    }),
  ]);
  if (leadCount + eventCount + spendCount + portalCount > 0) {
    // Soft-disable instead of hard delete when history exists
    const channel = await prisma.orgChannel.update({
      where: { id: existing.id },
      data: { enabled: false },
    });
    return res.json({ deleted: false, disabled: true, channel });
  }

  await prisma.orgChannel.delete({ where: { id: existing.id } });
  res.status(204).end();
});
