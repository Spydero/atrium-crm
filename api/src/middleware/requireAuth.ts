import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

export type AuthedRequest = Request & {
  session?: Awaited<ReturnType<typeof auth.api.getSession>>;
};

type SessionUser = {
  id: string;
  organizationId?: string | null;
  role?: string | null;
  platformRole?: string | null;
};

/**
 * Auth gate for CRM/API routes.
 * Re-hydrates organizationId / role / platformRole from Postgres on every request so
 * invite accept, Ops provisioning, and role changes are visible without forcing re-login
 * (Better Auth session.user can lag the User row).
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        organizationId: true,
        role: true,
        platformRole: true,
        disabledAt: true,
      },
    });
    if (!dbUser || dbUser.disabledAt) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = session.user as SessionUser;
    user.organizationId = dbUser.organizationId;
    user.role = dbUser.role;
    user.platformRole = dbUser.platformRole;

    req.session = session;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
