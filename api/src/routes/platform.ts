import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ensureOrgChannels } from "../lib/channels.js";
import { createInvitation, inviteAcceptUrl } from "../lib/invites.js";
import { createUserWithPassword } from "../lib/createUserAccount.js";
import { parseOrgRole } from "../lib/roles.js";
import { requirePlatform, type PlatformRequest } from "../middleware/requirePlatform.js";

export const platformRouter = Router();
platformRouter.use(requirePlatform);

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

platformRouter.get("/me", async (req, res) => {
  res.json({ user: (req as unknown as PlatformRequest).platformUser });
});

platformRouter.get("/overview", async (_req, res) => {
  const [organizations, pendingInvites, accessRequests, users] = await Promise.all([
    prisma.organization.count(),
    prisma.invitation.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.accessRequest.count({ where: { status: { in: ["SUBMITTED", "EMAIL_VERIFIED"] } } }),
    prisma.user.count({ where: { platformRole: null } }),
  ]);
  res.json({ organizations, pendingInvites, accessRequests, users });
});

platformRouter.get("/organizations", async (_req, res) => {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, invitations: true, leads: true } },
    },
  });
  res.json({
    organizations: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      currencyCode: o.currencyCode,
      defaultCity: o.defaultCity,
      createdAt: o.createdAt,
      users: o._count.users,
      invites: o._count.invitations,
      leads: o._count.leads,
    })),
  });
});

platformRouter.get("/organizations/:id", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: String(req.params.id) },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          disabledAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      invitations: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      currencyCode: org.currencyCode,
      currencyLabel: org.currencyLabel,
      defaultCity: org.defaultCity,
      licenseNumber: org.licenseNumber,
      createdAt: org.createdAt,
      suspendedAt: org.suspendedAt,
    },
    members: org.users,
    invitations: org.invitations.map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      role: i.role,
      expiresAt: i.expiresAt,
      acceptedAt: i.acceptedAt,
      createdAt: i.createdAt,
      acceptUrl: i.acceptedAt ? null : inviteAcceptUrl(i.token),
      token: i.acceptedAt ? null : i.token,
    })),
  });
});

platformRouter.post("/organizations", async (req, res) => {
  const platformUser = (req as unknown as PlatformRequest).platformUser;
  const schema = z.object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().min(2).max(60).optional(),
    currencyCode: z.string().trim().min(1).max(8).optional(),
    currencyLabel: z.string().trim().min(1).max(12).optional(),
    defaultCity: z.string().trim().max(120).optional(),
    ownerName: z.string().trim().min(1).max(120).optional(),
    ownerEmail: z.string().trim().email().optional(),
    /** Nested owner payload (admin UI). */
    owner: z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email(),
        role: z.string().optional(),
      })
      .optional(),
    /** If set, create the owner account immediately with this password (dev/ops). Prefer invite. */
    ownerPassword: z.string().min(8).max(72).optional(),
    inviteOwner: z.boolean().optional().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const ownerName = parsed.data.owner?.name || parsed.data.ownerName;
  const ownerEmailRaw = parsed.data.owner?.email || parsed.data.ownerEmail;
  if (!ownerName || !ownerEmailRaw) {
    return res.status(400).json({ error: "First owner name and email are required" });
  }

  const base = slugify(parsed.data.slug || parsed.data.name) || "brokerage";
  let slug = base;
  let n = 0;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }

  const ownerEmail = ownerEmailRaw.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (existingUser?.organizationId) {
    return res.status(409).json({ error: "That email already belongs to another brokerage" });
  }

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug,
      currencyCode: (parsed.data.currencyCode || "AED").toUpperCase(),
      currencyLabel: parsed.data.currencyLabel || parsed.data.currencyCode || "AED",
      defaultCity: parsed.data.defaultCity || "",
      status: "ACTIVE",
    },
  });
  await ensureOrgChannels(org.id);

  let owner = null;
  let invitation = null;

  if (parsed.data.ownerPassword && !parsed.data.inviteOwner) {
    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { organizationId: org.id, role: "owner", name: ownerName },
      });
      owner = existingUser;
    } else {
      owner = await createUserWithPassword({
        name: ownerName,
        email: ownerEmail,
        password: parsed.data.ownerPassword,
        role: "owner",
        organizationId: org.id,
      });
    }
  } else {
    invitation = await createInvitation({
      organizationId: org.id,
      email: ownerEmail,
      name: ownerName,
      role: "owner",
      createdById: platformUser.id,
    });
  }

  res.status(201).json({
    organization: org,
    owner: owner
      ? { id: owner.id, email: ownerEmail, name: ownerName, role: "owner" }
      : null,
    invitation: invitation
      ? {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          acceptUrl: inviteAcceptUrl(invitation.token),
          token: invitation.token,
        }
      : null,
  });
});

platformRouter.patch("/organizations/:id", async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    defaultCity: z.string().trim().max(120).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const id = String(req.params.id);
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Organization not found" });

  const org = await prisma.organization.update({
    where: { id },
    data: {
      ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
      ...(parsed.data.defaultCity != null ? { defaultCity: parsed.data.defaultCity } : {}),
      ...(parsed.data.status != null
        ? {
            status: parsed.data.status,
            suspendedAt: parsed.data.status === "SUSPENDED" ? new Date() : null,
          }
        : {}),
    },
  });
  res.json({ organization: org });
});

platformRouter.post("/organizations/:id/invites", async (req, res) => {
  const platformUser = (req as unknown as PlatformRequest).platformUser;
  const schema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    role: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const role = parseOrgRole(parsed.data.role);
  // Platform Ops provisions the brokerage leadership only. Brokers join via CRM team invites.
  if (!role || role === "broker") {
    return res.status(400).json({
      error: "Platform invites are limited to owner or admin. Invite brokers from the CRM.",
    });
  }

  const orgId = String(req.params.id);
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  if (org.status === "SUSPENDED") {
    return res.status(400).json({ error: "Organization is suspended" });
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.organizationId && existing.organizationId !== orgId) {
    return res.status(409).json({ error: "Email already belongs to another brokerage" });
  }
  if (existing?.organizationId === orgId) {
    return res.status(409).json({ error: "User is already a member of this brokerage" });
  }

  const invitation = await createInvitation({
    organizationId: orgId,
    email,
    name: parsed.data.name,
    role,
    createdById: platformUser.id,
  });

  res.status(201).json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      acceptUrl: inviteAcceptUrl(invitation.token),
      token: invitation.token,
    },
  });
});

platformRouter.get("/invites", async (_req, res) => {
  const invites = await prisma.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  res.json({
    invitations: invites.map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      expired: i.expiresAt < new Date(),
      organization: i.organization,
      acceptUrl: inviteAcceptUrl(i.token),
      token: i.token,
    })),
  });
});

platformRouter.post("/invites/:id/revoke", async (req, res) => {
  const id = String(req.params.id);
  const inv = await prisma.invitation.findUnique({ where: { id } });
  if (!inv) return res.status(404).json({ error: "Invite not found" });
  if (inv.acceptedAt) return res.status(400).json({ error: "Already accepted" });
  const updated = await prisma.invitation.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  res.json({ invitation: updated });
});
