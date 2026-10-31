import { randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";
import type { OrgRole } from "./roles.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newInviteToken() {
  return randomBytes(32).toString("base64url");
}

export async function createInvitation(opts: {
  organizationId: string;
  email: string;
  name: string;
  role: OrgRole;
  createdById?: string | null;
}) {
  const email = opts.email.trim().toLowerCase();
  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  // Revoke any open invite for same email+org
  await prisma.invitation.updateMany({
    where: {
      organizationId: opts.organizationId,
      email,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return prisma.invitation.create({
    data: {
      organizationId: opts.organizationId,
      email,
      name: opts.name.trim(),
      role: opts.role,
      token,
      expiresAt,
      createdById: opts.createdById ?? null,
    },
  });
}

export function inviteAcceptUrl(token: string) {
  const base = (process.env.CLIENT_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/invite/${token}`;
}
