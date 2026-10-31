import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createUserWithPassword } from "../lib/createUserAccount.js";
import { normalizeOrgRole } from "../lib/roles.js";
import { hashPassword } from "better-auth/crypto";

export const invitesRouter = Router();

/** Public: preview invite (no auth). */
invitesRouter.get("/:token", async (req, res) => {
  const token = String(req.params.token);
  const inv = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: { select: { id: true, name: true, slug: true, status: true } } },
  });
  if (!inv || inv.revokedAt) return res.status(404).json({ error: "Invite not found" });
  if (inv.acceptedAt) return res.status(410).json({ error: "Invite already accepted" });
  if (inv.expiresAt < new Date()) return res.status(410).json({ error: "Invite expired" });
  if (inv.organization.status === "SUSPENDED") {
    return res.status(400).json({ error: "This brokerage is suspended" });
  }
  res.json({
    invitation: {
      email: inv.email,
      name: inv.name,
      role: inv.role,
      expiresAt: inv.expiresAt,
      organization: inv.organization,
    },
  });
});

/** Public: accept invite and set password. */
invitesRouter.post("/:token/accept", async (req, res) => {
  const schema = z.object({
    password: z.string().min(8).max(72),
    name: z.string().trim().min(1).max(120).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const token = String(req.params.token);
  const inv = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: true },
  });
  if (!inv || inv.revokedAt) return res.status(404).json({ error: "Invite not found" });
  if (inv.acceptedAt) return res.status(410).json({ error: "Invite already accepted" });
  if (inv.expiresAt < new Date()) return res.status(410).json({ error: "Invite expired" });
  if (inv.organization.status === "SUSPENDED") {
    return res.status(400).json({ error: "This brokerage is suspended" });
  }

  const role = normalizeOrgRole(inv.role);
  const name = parsed.data.name?.trim() || inv.name;
  const email = inv.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  let userId: string;

  if (existing) {
    if (existing.organizationId && existing.organizationId !== inv.organizationId) {
      return res.status(409).json({ error: "Email already belongs to another brokerage" });
    }
    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          role,
          organizationId: inv.organizationId,
          emailVerified: true,
          disabledAt: null,
        },
      }),
      prisma.account.deleteMany({
        where: { userId: existing.id, providerId: "credential" },
      }),
      prisma.account.create({
        data: {
          userId: existing.id,
          accountId: existing.id,
          providerId: "credential",
          password: passwordHash,
        },
      }),
      prisma.invitation.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
    userId = existing.id;
  } else {
    const user = await createUserWithPassword({
      name,
      email,
      password: parsed.data.password,
      role,
      organizationId: inv.organizationId,
      emailVerified: true,
    });
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { acceptedAt: new Date() },
    });
    userId = user.id;
  }

  res.status(201).json({
    ok: true,
    userId,
    email,
    organizationId: inv.organizationId,
    role,
    message: "Account ready. Sign in with your email and password.",
  });
});
