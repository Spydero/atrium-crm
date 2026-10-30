import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { DEMO_PLACES, searchCatalog } from "../data/stockCatalog.js";

export const testingRouter = Router();

function testingEnabled() {
  return String(process.env.TESTING_ENABLED || "").toLowerCase() === "true";
}

testingRouter.get("/status", (_req, res) => {
  res.json({
    testingEnabled: testingEnabled(),
    photoProvider: "local",
  });
});

testingRouter.get("/places", requireAuth, (_req, res) => {
  if (!testingEnabled()) {
    return res.status(403).json({ error: "Testing disabled" });
  }
  res.json({
    places: DEMO_PLACES,
    provider: "local",
    note: "Local catalog - no API keys. Pick a place or search tags.",
  });
});

/**
 * Stock photos for TESTING only - local curated catalog (no third-party APIs).
 * Place names stay yours; we only return image URLs.
 */
testingRouter.get("/photos", requireAuth, async (req, res) => {
  if (!testingEnabled()) {
    return res.status(403).json({
      error: "Testing photo picker is disabled. Set TESTING_ENABLED=true in api/.env",
    });
  }

  const q = String(req.query.q || "apartment living").trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const { photos, total } = searchCatalog(q, page, 12);

  res.json({
    provider: "local",
    query: q,
    total,
    photos: photos.map((p) => ({
      id: p.id,
      url: p.url,
      thumb: p.thumb,
      photographer: p.label,
      attribution: p.label,
    })),
    note: "Built-in catalog (~48 property photos). No Unsplash/Pexels/Pixabay keys needed.",
  });
});
