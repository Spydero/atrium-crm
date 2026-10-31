import type { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { isPlatformOperator } from "../lib/roles.js";
import { requireAuth, type AuthedRequest } from "./requireAuth.js";

export type PlatformRequest = AuthedRequest & {
  platformUser: {
    id: string;
    email: string;
    name: string;
    platformRole: string;
  };
};

/** Session + platformRole required. */
export function requirePlatform(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, async () => {
    try {
      const id = req.session?.user?.id;
      if (!id) return res.status(401).json({ error: "Unauthorized" });
      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, name: true, platformRole: true, disabledAt: true },
      });
      if (!user || user.disabledAt) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!isPlatformOperator(user.platformRole)) {
        return res.status(403).json({ error: "Platform operator access required" });
      }
      (req as PlatformRequest).platformUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole!,
      };
      next();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Auth check failed" });
    }
  });
}
