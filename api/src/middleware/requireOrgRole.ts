import type { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { roleAtLeast, type OrgRole } from "../lib/roles.js";
import type { AuthedRequest } from "./requireAuth.js";

/** Require an active brokerage membership and minimum org role. */
export function requireOrgRole(min: OrgRole) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.session?.user?.id;
      if (!id) return res.status(401).json({ error: "Unauthorized" });
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          role: true,
          organizationId: true,
          disabledAt: true,
          organization: { select: { status: true } },
        },
      });
      if (!user || user.disabledAt) return res.status(401).json({ error: "Unauthorized" });
      if (!user.organizationId) {
        return res.status(400).json({ error: "No organization" });
      }
      if (user.organization?.status === "SUSPENDED") {
        return res.status(403).json({ error: "This brokerage is suspended" });
      }
      if (!roleAtLeast(user.role, min)) {
        return res.status(403).json({ error: `Requires ${min} access or higher` });
      }
      next();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Auth check failed" });
    }
  };
}
