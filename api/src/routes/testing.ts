import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

export const testingRouter = Router();

function testingEnabled() {
  return String(process.env.TESTING_ENABLED || "").toLowerCase() === "true";
}

/** Public-ish config for the web app (no secrets). */
testingRouter.get("/status", (_req, res) => {
  res.json({
    testingEnabled: testingEnabled(),
    photoProvider: process.env.UNSPLASH_ACCESS_KEY ? "unsplash" : "picsum",
  });
});

type StockPhoto = {
  id: string;
  url: string;
  thumb: string;
  photographer?: string;
  attribution?: string;
};

/**
 * Stock photos for TESTING only.
 * - With UNSPLASH_ACCESS_KEY: search Unsplash (free developer key).
 * - Without key: Lorem Picsum list (no signup) so demos still work.
 * Location/place is NEVER taken from these APIs — only the image URL.
 */
testingRouter.get("/photos", requireAuth, async (req, res) => {
  if (!testingEnabled()) {
    return res.status(403).json({
      error: "Testing photo picker is disabled. Set TESTING_ENABLED=true in api/.env",
    });
  }

  const q = String(req.query.q || "modern apartment interior").trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const key = process.env.UNSPLASH_ACCESS_KEY;

  try {
    if (key) {
      const url = new URL("https://api.unsplash.com/search/photos");
      url.searchParams.set("query", q);
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", "12");
      url.searchParams.set("orientation", "landscape");

      const r = await fetch(url, {
        headers: { Authorization: `Client-ID ${key}` },
      });
      if (!r.ok) {
        const text = await r.text();
        return res.status(502).json({ error: "Unsplash request failed", detail: text.slice(0, 200) });
      }
      const data = (await r.json()) as {
        results: {
          id: string;
          urls: { regular: string; small: string };
          user: { name: string };
          links: { html: string };
        }[];
      };
      const photos: StockPhoto[] = data.results.map((p) => ({
        id: p.id,
        url: p.urls.regular,
        thumb: p.urls.small,
        photographer: p.user.name,
        attribution: `Photo by ${p.user.name} on Unsplash`,
      }));
      return res.json({ provider: "unsplash", query: q, photos });
    }

    // Zero-config fallback: Picsum (no API key)
    const r = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=12`);
    if (!r.ok) {
      return res.status(502).json({ error: "Picsum request failed" });
    }
    const data = (await r.json()) as {
      id: string;
      author: string;
      download_url: string;
    }[];
    const photos: StockPhoto[] = data.map((p) => ({
      id: p.id,
      url: `https://picsum.photos/id/${p.id}/1200/800`,
      thumb: `https://picsum.photos/id/${p.id}/400/280`,
      photographer: p.author,
      attribution: `Photo by ${p.author} on Picsum`,
    }));
    return res.json({
      provider: "picsum",
      query: q,
      photos,
      note: "Add UNSPLASH_ACCESS_KEY for keyword search. Picsum is a random gallery fallback.",
    });
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Failed to load stock photos",
    });
  }
});
