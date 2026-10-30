import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

export const placesRouter = Router();
placesRouter.use(requireAuth);

type PlaceHit = {
  placeId: string;
  label: string;
  community: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
};

const cache = new Map<string, { at: number; hits: PlaceHit[] }>();
const CACHE_MS = 5 * 60 * 1000;

function pickName(addr: Record<string, string | undefined>, keys: string[]) {
  for (const k of keys) {
    if (addr[k]) return addr[k]!;
  }
  return "";
}

function mapNominatim(row: {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}): PlaceHit {
  const addr = row.address || {};
  const community = pickName(addr, [
    "suburb",
    "neighbourhood",
    "neighborhood",
    "quarter",
    "city_district",
    "district",
    "village",
    "town",
    "hamlet",
  ]);
  const city = pickName(addr, [
    "city",
    "town",
    "municipality",
    "county",
    "state_district",
    "state",
  ]);
  const road = pickName(addr, ["road", "pedestrian", "path"]);
  const building = pickName(addr, ["building", "house_number"]);
  const address = [building, road, community, city].filter(Boolean).join(", ") || row.display_name;

  return {
    placeId: `osm:${row.place_id}`,
    label: row.display_name,
    community: community || city || row.display_name.split(",")[0]?.trim() || "",
    city,
    address,
    lat: Number(row.lat),
    lng: Number(row.lon),
  };
}

placesRouter.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ results: [] as PlaceHit[] });

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return res.json({ results: cached.hits });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "8");

  try {
    const upstream = await fetch(url.toString(), {
      headers: {
        "User-Agent": "AtriumCRM/1.1 (brokerage demo; contact: atrium.demo)",
        Accept: "application/json",
      },
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: "Place search unavailable" });
    }
    const raw = (await upstream.json()) as Parameters<typeof mapNominatim>[0][];
    const hits = (Array.isArray(raw) ? raw : []).map(mapNominatim);
    cache.set(key, { at: Date.now(), hits });
    res.json({ results: hits });
  } catch {
    res.status(502).json({ error: "Place search failed" });
  }
});
