import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

/**
 * Public self-serve org bootstrap is closed.
 * Organizations are created by platform operators via /api/platform/organizations.
 */
export const bootstrapRouter = Router();
bootstrapRouter.use(requireAuth);

bootstrapRouter.post("/organization", async (_req: AuthedRequest, res) => {
  return res.status(403).json({
    error:
      "Self-serve brokerage creation is disabled. Ask an Atrium operator to provision your organization, or accept an invite.",
  });
});
