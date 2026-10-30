/**
 * Local testing catalog - no API keys.
 * Images are public Unsplash CDN URLs (display-only for demos).
 * Place names / tags are ours; search is local string match.
 */

export type CatalogPhoto = {
  id: string;
  url: string;
  thumb: string;
  tags: string[];
  label: string;
};

export const DEMO_PLACES = [
  { id: "marina", label: "Dubai Marina", query: "marina apartment waterfront" },
  { id: "palm", label: "Palm Jumeirah", query: "villa pool palm" },
  { id: "downtown", label: "Downtown", query: "downtown apartment skyline" },
  { id: "jvc", label: "JVC", query: "townhouse family" },
  { id: "business-bay", label: "Business Bay", query: "office desk" },
  { id: "hills", label: "Dubai Hills", query: "hills apartment living" },
] as const;

/** ~48 place-tagged interiors/exteriors for the picker + seed. */
export const STOCK_CATALOG: CatalogPhoto[] = [
  // Marina / waterfront apartments
  {
    id: "m1",
    label: "Bright marina living room",
    tags: ["marina", "apartment", "living", "waterfront", "modern"],
    url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=70",
  },
  {
    id: "m2",
    label: "Glass balcony city apartment",
    tags: ["marina", "apartment", "balcony", "city", "modern"],
    url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&q=70",
  },
  {
    id: "m3",
    label: "Minimal waterfront flat",
    tags: ["marina", "apartment", "minimal", "sofa", "interior"],
    url: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400&q=70",
  },
  {
    id: "m4",
    label: "Open kitchen apartment",
    tags: ["marina", "apartment", "kitchen", "open", "modern"],
    url: "https://images.unsplash.com/photo-1556912173-46c336c7fd55?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1556912173-46c336c7fd55?w=400&q=70",
  },
  {
    id: "m5",
    label: "Evening apartment glow",
    tags: ["marina", "apartment", "evening", "living", "interior"],
    url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&q=70",
  },
  {
    id: "m6",
    label: "Blue-tone city loft",
    tags: ["marina", "apartment", "loft", "city", "interior"],
    url: "https://images.unsplash.com/photo-1560184897-ae75f418493e?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1560184897-ae75f418493e?w=400&q=70",
  },

  // Palm / villa / pool
  {
    id: "p1",
    label: "Villa with pool",
    tags: ["palm", "villa", "pool", "exterior", "luxury"],
    url: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=400&q=70",
  },
  {
    id: "p2",
    label: "Resort-style villa night",
    tags: ["palm", "villa", "pool", "night", "luxury"],
    url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=70",
  },
  {
    id: "p3",
    label: "White villa garden",
    tags: ["palm", "villa", "exterior", "garden", "luxury"],
    url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=70",
  },
  {
    id: "p4",
    label: "Infinity pool terrace",
    tags: ["palm", "villa", "pool", "terrace", "luxury"],
    url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&q=70",
  },
  {
    id: "p5",
    label: "Luxury villa courtyard",
    tags: ["palm", "villa", "courtyard", "exterior", "luxury"],
    url: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&q=70",
  },
  {
    id: "p6",
    label: "Modern mansion facade",
    tags: ["palm", "villa", "mansion", "exterior", "modern"],
    url: "https://images.unsplash.com/photo-1605146769289-440113cc3d00?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1605146769289-440113cc3d00?w=400&q=70",
  },

  // Downtown / skyline
  {
    id: "d1",
    label: "Skyline loft windows",
    tags: ["downtown", "apartment", "skyline", "windows", "modern"],
    url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&q=70",
  },
  {
    id: "d2",
    label: "High-rise bedroom view",
    tags: ["downtown", "apartment", "bedroom", "view", "city"],
    url: "https://images.unsplash.com/photo-1631889993959-41b4e9c6e3c5?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1631889993959-41b4e9c6e3c5?w=400&q=70",
  },
  {
    id: "d3",
    label: "Urban studio white",
    tags: ["downtown", "apartment", "studio", "white", "minimal"],
    url: "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=400&q=70",
  },
  {
    id: "d4",
    label: "City condo living",
    tags: ["downtown", "apartment", "condo", "living", "city"],
    url: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400&q=70",
  },
  {
    id: "d5",
    label: "Penthouse dining",
    tags: ["downtown", "apartment", "penthouse", "dining", "luxury"],
    url: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=400&q=70",
  },
  {
    id: "d6",
    label: "Glass tower interior",
    tags: ["downtown", "apartment", "glass", "modern", "interior"],
    url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=400&q=70",
  },

  // JVC / townhouse / family
  {
    id: "j1",
    label: "Family townhouse lounge",
    tags: ["jvc", "townhouse", "family", "living", "bright"],
    url: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=400&q=70",
  },
  {
    id: "j2",
    label: "Townhouse kitchen island",
    tags: ["jvc", "townhouse", "kitchen", "family", "bright"],
    url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=70",
  },
  {
    id: "j3",
    label: "Suburban home exterior",
    tags: ["jvc", "townhouse", "exterior", "family", "home"],
    url: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=70",
  },
  {
    id: "j4",
    label: "Cozy family living",
    tags: ["jvc", "townhouse", "cozy", "family", "living"],
    url: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&q=70",
  },
  {
    id: "j5",
    label: "Townhome staircase",
    tags: ["jvc", "townhouse", "stairs", "interior", "home"],
    url: "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=400&q=70",
  },
  {
    id: "j6",
    label: "Garden patio home",
    tags: ["jvc", "townhouse", "patio", "garden", "family"],
    url: "https://images.unsplash.com/photo-1600047509358-9dc75507daeb?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600047509358-9dc75507daeb?w=400&q=70",
  },

  // Business Bay / office
  {
    id: "b1",
    label: "Glass office desk",
    tags: ["business-bay", "office", "desk", "glass", "modern"],
    url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=70",
  },
  {
    id: "b2",
    label: "Open plan workspace",
    tags: ["business-bay", "office", "workspace", "open", "modern"],
    url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=400&q=70",
  },
  {
    id: "b3",
    label: "Corner office view",
    tags: ["business-bay", "office", "corner", "view", "city"],
    url: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=400&q=70",
  },
  {
    id: "b4",
    label: "Meeting room glass",
    tags: ["business-bay", "office", "meeting", "glass", "corporate"],
    url: "https://images.unsplash.com/photo-1431540015161-0bf868a2d407?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1431540015161-0bf868a2d407?w=400&q=70",
  },
  {
    id: "b5",
    label: "Coworking loft office",
    tags: ["business-bay", "office", "coworking", "loft", "desk"],
    url: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=400&q=70",
  },
  {
    id: "b6",
    label: "Executive suite",
    tags: ["business-bay", "office", "executive", "suite", "modern"],
    url: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=400&q=70",
  },

  // Hills / contemporary living
  {
    id: "h1",
    label: "Sunlit hills living",
    tags: ["hills", "apartment", "living", "sofa", "natural"],
    url: "https://images.unsplash.com/photo-1600210492493-0946911123ea?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600210492493-0946911123ea?w=400&q=70",
  },
  {
    id: "h2",
    label: "Warm contemporary lounge",
    tags: ["hills", "apartment", "lounge", "warm", "contemporary"],
    url: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400&q=70",
  },
  {
    id: "h3",
    label: "Green-view living room",
    tags: ["hills", "apartment", "green", "living", "windows"],
    url: "https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=400&q=70",
  },
  {
    id: "h4",
    label: "Scandi apartment light",
    tags: ["hills", "apartment", "scandi", "light", "interior"],
    url: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=400&q=70",
  },
  {
    id: "h5",
    label: "Neutral bedroom suite",
    tags: ["hills", "apartment", "bedroom", "neutral", "suite"],
    url: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=400&q=70",
  },
  {
    id: "h6",
    label: "Park-facing living",
    tags: ["hills", "apartment", "park", "living", "bright"],
    url: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=400&q=70",
  },

  // Generic modern extras
  {
    id: "g1",
    label: "Modern white kitchen",
    tags: ["apartment", "kitchen", "white", "modern", "interior"],
    url: "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=400&q=70",
  },
  {
    id: "g2",
    label: "Marble bathroom",
    tags: ["apartment", "bathroom", "marble", "luxury", "interior"],
    url: "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=400&q=70",
  },
  {
    id: "g3",
    label: "Hotel-style bedroom",
    tags: ["apartment", "bedroom", "hotel", "luxury", "interior"],
    url: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=400&q=70",
  },
  {
    id: "g4",
    label: "Rooftop terrace seating",
    tags: ["apartment", "terrace", "rooftop", "outdoor", "city"],
    url: "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?w=400&q=70",
  },
  {
    id: "g5",
    label: "Designer dining room",
    tags: ["apartment", "dining", "designer", "modern", "interior"],
    url: "https://images.unsplash.com/photo-1617806118233-18e1de247200?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1617806118233-18e1de247200?w=400&q=70",
  },
  {
    id: "g6",
    label: "Lobby-style entrance",
    tags: ["apartment", "lobby", "entrance", "modern", "building"],
    url: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=400&q=70",
  },
];

export function searchCatalog(query: string, page = 1, perPage = 12) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

  const scored = STOCK_CATALOG.map((photo) => {
    const hay = `${photo.label} ${photo.tags.join(" ")}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += 2;
      if (photo.tags.includes(t)) score += 3;
    }
    // Soft boost so empty / weak queries still return a gallery
    if (!tokens.length) score = 1;
    return { photo, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const list = (scored.length ? scored : STOCK_CATALOG.map((photo) => ({ photo, score: 0 }))).map(
    (x) => x.photo,
  );

  const start = (page - 1) * perPage;
  return {
    total: list.length,
    photos: list.slice(start, start + perPage),
  };
}

export function coverForPlace(community: string, propertyType: string, index: number) {
  const c = community.toLowerCase();
  const t = propertyType.toLowerCase();
  let tag = "apartment";
  if (c.includes("marina")) tag = "marina";
  else if (c.includes("palm")) tag = "palm";
  else if (c.includes("downtown")) tag = "downtown";
  else if (c.includes("village") || c.includes("jvc")) tag = "jvc";
  else if (c.includes("business")) tag = "business-bay";
  else if (c.includes("hills")) tag = "hills";
  else if (t.includes("villa")) tag = "villa";
  else if (t.includes("office")) tag = "office";
  else if (t.includes("town")) tag = "townhouse";

  const hits = STOCK_CATALOG.filter((p) => p.tags.includes(tag));
  const pool = hits.length ? hits : STOCK_CATALOG;
  return pool[index % pool.length];
}
