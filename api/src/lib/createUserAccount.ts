import { hashPassword } from "better-auth/crypto";
import { prisma } from "./prisma.js";
import type { OrgRole } from "./roles.js";

/** Create a Better Auth-compatible user + credential account (bypasses public signup). */
export async function createUserWithPassword(opts: {
  name: string;
  email: string;
  password: string;
  role: OrgRole;
  organizationId: string | null;
  platformRole?: string | null;
  emailVerified?: boolean;
}) {
  const email = opts.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error("A user with that email already exists") as Error & { status: number };
    err.status = 409;
    throw err;
  }

  const passwordHash = await hashPassword(opts.password);
  // Better Auth looks up credentials with accountId === user.id
  const user = await prisma.user.create({
    data: {
      name: opts.name.trim(),
      email,
      emailVerified: opts.emailVerified ?? true,
      role: opts.role,
      organizationId: opts.organizationId,
      platformRole: opts.platformRole ?? null,
    },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: passwordHash,
    },
  });
  return user;
}
