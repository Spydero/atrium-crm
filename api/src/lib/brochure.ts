import type { Listing, Organization } from "@prisma/client";
import {
  COLORS,
  MARGIN,
  PAGE_H,
  PAGE_W,
  docToBuffer,
  fetchBuffer,
  formatDate,
  line,
  money,
  sectionLabel,
  type Doc,
} from "./pdfTheme.js";

type ListingWithOrg = Listing & {
  organization: Pick<Organization, "name" | "currencyLabel">;
};

const CONTENT_W = PAGE_W - MARGIN * 2;

// ---------- OpenStreetMap static map (tiles stitched server side) ----------
const tileCache = new Map<string, Buffer>();

function tileXY(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

async function loadTile(z: number, x: number, y: number) {
  const key = `${z}/${x}/${y}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const buf = await fetchBuffer(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, 400_000);
  if (buf) {
    if (tileCache.size > 200) tileCache.clear();
    tileCache.set(key, buf);
  }
  return buf;
}

async function buildMap(lat: number, lng: number) {
  const z = 15;
  const { x, y } = tileXY(lat, lng, z);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const jobs: Promise<Buffer | null>[] = [];
  const coords: { dx: number; dy: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      coords.push({ dx, dy });
      jobs.push(loadTile(z, tx + dx, ty + dy));
    }
  }
  const bufs = await Promise.all(jobs);
  if (bufs.some((b) => !b)) return null;
  return {
    tiles: coords.map((c, i) => ({ ...c, buf: bufs[i] as Buffer })),
    // pixel position of the point inside the 3x3 grid
    px: (x - (tx - 1)) * 256,
    py: (y - (ty - 1)) * 256,
  };
}

// ---------- drawing ----------
function drawHeader(doc: Doc, orgName: string) {
  doc.rect(0, 0, PAGE_W, 62).fill(COLORS.dark);
  doc.rect(0, 62, PAGE_W, 3).fill(COLORS.mark);
  line(doc, orgName.toUpperCase(), MARGIN, 24, {
    size: 12,
    font: "Helvetica-Bold",
    color: COLORS.white,
    spacing: 1.6,
    width: 330,
  });
  line(doc, "PROPERTY BROCHURE", MARGIN, 24, {
    size: 7.5,
    font: "Helvetica-Bold",
    color: COLORS.accentLight,
    spacing: 1.6,
    width: CONTENT_W,
    align: "right",
  });
  line(doc, "Prepared by Atrium", MARGIN, 38, {
    size: 7.5,
    color: "#8b949e",
    width: CONTENT_W,
    align: "right",
  });
}

function drawHero(
  doc: Doc,
  listing: ListingWithOrg,
  img: Buffer | null,
  y: number,
  h: number,
) {
  doc.save();
  doc.rect(0, y, PAGE_W, h).clip();
  let drew = false;
  if (img) {
    try {
      doc.image(img, 0, y, { cover: [PAGE_W, h], align: "center", valign: "center" });
      drew = true;
    } catch {
      drew = false;
    }
  }
  if (!drew) {
    const g = doc.linearGradient(0, y, PAGE_W, y + h);
    g.stop(0, COLORS.accent).stop(1, COLORS.dark);
    doc.rect(0, y, PAGE_W, h).fill(g);
  }
  // bottom scrim for text legibility
  const scrim = doc.linearGradient(0, y + h - 150, 0, y + h);
  scrim.stop(0, "#000000", 0).stop(1, "#000000", 0.78);
  doc.rect(0, y + h - 150, PAGE_W, 150).fill(scrim);
  doc.restore();

  // status chip
  const status = listing.status.charAt(0) + listing.status.slice(1).toLowerCase();
  doc.roundedRect(MARGIN, y + 18, 70, 20, 10).fill(COLORS.white);
  line(doc, status.toUpperCase(), MARGIN, y + 24, {
    size: 7.5,
    font: "Helvetica-Bold",
    color: COLORS.accent,
    spacing: 1,
    width: 70,
    align: "center",
  });

  // price block
  line(doc, "ASKING PRICE", MARGIN, y + h - 62, {
    size: 7.5,
    font: "Helvetica-Bold",
    color: COLORS.white,
    spacing: 1.4,
    opacity: 0.85,
  });
  line(doc, money(listing.priceAed, listing.organization.currencyLabel || "AED"), MARGIN, y + h - 48, {
    size: 30,
    font: "Helvetica-Bold",
    color: COLORS.white,
  });
  line(doc, `REF ${listing.id.slice(-6).toUpperCase()}`, MARGIN, y + h - 28, {
    size: 8,
    font: "Helvetica-Bold",
    color: COLORS.white,
    spacing: 1.2,
    width: CONTENT_W,
    align: "right",
    opacity: 0.85,
  });
}

function specCard(doc: Doc, x: number, y: number, w: number, value: string, label: string) {
  doc.roundedRect(x, y, w, 58, 8).fill(COLORS.paper);
  doc.roundedRect(x, y, w, 58, 8).lineWidth(0.6).strokeColor(COLORS.line).stroke();
  doc.rect(x + 14, y + 12, 18, 2.5).fill(COLORS.mark);
  line(doc, value, x + 14, y + 22, {
    size: 18,
    font: "Helvetica-Bold",
    color: COLORS.ink,
    width: w - 24,
  });
  line(doc, label.toUpperCase(), x + 14, y + 44, {
    size: 7,
    font: "Helvetica-Bold",
    color: COLORS.muted,
    spacing: 1,
    width: w - 24,
  });
}

function detailRow(doc: Doc, x: number, y: number, w: number, label: string, value: string) {
  line(doc, label.toUpperCase(), x, y + 6, {
    size: 7,
    font: "Helvetica-Bold",
    color: COLORS.muted,
    spacing: 0.9,
    width: 80,
  });
  line(doc, value, x + 84, y + 4.5, {
    size: 10,
    font: "Helvetica-Bold",
    color: COLORS.ink,
    width: w - 90,
  });
  doc
    .moveTo(x, y + 22)
    .lineTo(x + w, y + 22)
    .lineWidth(0.5)
    .strokeColor(COLORS.line)
    .stroke();
}

function prettyType(t: string) {
  const s = t.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function buildBrochurePdf(listing: ListingWithOrg): Promise<Buffer> {
  const cover = await fetchBuffer(listing.coverUrl);
  const gallery = await Promise.all(
    listing.photoUrls
      .filter((u) => u && u !== listing.coverUrl)
      .slice(0, 3)
      .map((u) => fetchBuffer(u)),
  );
  const photos = gallery.filter((b): b is Buffer => Boolean(b));
  const hasPin = listing.lat != null && listing.lng != null;
  const map = hasPin ? await buildMap(listing.lat as number, listing.lng as number) : null;

  const orgName = listing.organization.name;
  const place =
    [listing.building, listing.community, listing.city].filter(Boolean).join(", ") ||
    listing.address ||
    "Location on request";

  return docToBuffer(
    (doc) => {
      doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.white);

      drawHeader(doc, orgName);

      const heroY = 65;
      const heroH = 280;
      drawHero(doc, listing, cover, heroY, heroH);

      // Title + place
      let y = heroY + heroH + 20;
      doc
        .font("Helvetica-Bold")
        .fontSize(23)
        .fillColor(COLORS.ink)
        .text(listing.title, MARGIN, y, {
          width: CONTENT_W,
          height: 30,
          lineBreak: false,
          ellipsis: true,
        });
      y += 31;
      line(doc, place, MARGIN, y, {
        size: 11,
        color: COLORS.muted,
        width: CONTENT_W,
      });

      // Spec cards
      y += 26;
      const gap = 10;
      const cardW = (CONTENT_W - gap * 3) / 4;
      const noBedrooms = listing.propertyType === "OFFICE" || listing.propertyType === "LAND";
      const beds = listing.beds > 0 ? String(listing.beds) : noBedrooms ? "N/A" : "Studio";
      specCard(doc, MARGIN, y, cardW, beds, "Bedrooms");
      specCard(doc, MARGIN + (cardW + gap), y, cardW, String(listing.baths), "Bathrooms");
      specCard(
        doc,
        MARGIN + (cardW + gap) * 2,
        y,
        cardW,
        listing.areaSqft.toLocaleString("en-US"),
        "Area (sqft)",
      );
      specCard(doc, MARGIN + (cardW + gap) * 3, y, cardW, prettyType(listing.propertyType), "Property type");

      // About
      y += 58 + 22;
      sectionLabel(doc, "About this property", MARGIN, y);
      const about =
        listing.description?.trim() ||
        `${noBedrooms ? "A" : beds === "Studio" ? "A studio" : `A ${listing.beds} bedroom`} ${listing.propertyType.toLowerCase()} in ${listing.community}${listing.city ? `, ${listing.city}` : ""}, offered by ${orgName}. Contact us to arrange a viewing.`;
      doc.font("Helvetica").fontSize(10.5);
      const aboutH = Math.min(
        78,
        doc.heightOfString(about, { width: CONTENT_W, lineGap: 3.5 }),
      );
      doc.fillColor(COLORS.body).text(about, MARGIN, y + 24, {
        width: CONTENT_W,
        height: 78,
        lineGap: 3.5,
        ellipsis: true,
      });

      // Details grid
      y += 24 + aboutH + 20;
      const colW = (CONTENT_W - 24) / 2;
      const details: [string, string][] = [
        ["Community", listing.community],
        ["City", listing.city || "-"],
        ["Building", listing.building || "-"],
        ["Status", listing.status.charAt(0) + listing.status.slice(1).toLowerCase()],
        ["Address", listing.address || place],
        ["Listed", formatDate(new Date(listing.createdAt))],
      ];
      details.forEach(([label, value], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        detailRow(doc, MARGIN + col * (colW + 24), y + row * 24, colW, label, value);
      });

      // Location map or photo strip
      y += 3 * 24 + 14;
      const blockH = Math.max(80, PAGE_H - 52 - y - 10);
      if (map) {
        doc.save();
        doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 8).clip();
        doc.rect(MARGIN, y, CONTENT_W, blockH).fill(COLORS.track);
        for (const t of map.tiles) {
          const tx = MARGIN + CONTENT_W / 2 - map.px + (t.dx + 1) * 256;
          const ty = y + blockH / 2 - map.py + (t.dy + 1) * 256;
          try {
            doc.image(t.buf, tx, ty, { width: 256, height: 256 });
          } catch {
            /* skip broken tile */
          }
        }
        doc.restore();
        // pin
        const cx = MARGIN + CONTENT_W / 2;
        const cy = y + blockH / 2;
        doc.circle(cx, cy, 9).fill(COLORS.mark);
        doc.circle(cx, cy, 9).lineWidth(2.5).strokeColor(COLORS.white).stroke();
        doc.circle(cx, cy, 3).fill(COLORS.white);
        // frame + attribution
        doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 8).lineWidth(0.8).strokeColor(COLORS.line).stroke();
        doc.roundedRect(MARGIN + 10, y + 10, 170, 22, 6).fill(COLORS.white);
        line(doc, place, MARGIN + 18, y + 17, {
          size: 8,
          font: "Helvetica-Bold",
          color: COLORS.ink,
          width: 156,
        });
        line(doc, "(c) OpenStreetMap contributors", MARGIN, y + blockH - 12, {
          size: 6.5,
          color: COLORS.muted,
          width: CONTENT_W - 8,
          align: "right",
        });
      } else if (photos.length) {
        const n = photos.length;
        const pw = (CONTENT_W - 10 * (n - 1)) / n;
        photos.forEach((p, i) => {
          doc.save();
          doc.roundedRect(MARGIN + i * (pw + 10), y, pw, blockH, 8).clip();
          try {
            doc.image(p, MARGIN + i * (pw + 10), y, {
              cover: [pw, blockH],
              align: "center",
              valign: "center",
            });
          } catch {
            doc.rect(MARGIN + i * (pw + 10), y, pw, blockH).fill(COLORS.track);
          }
          doc.restore();
        });
      } else {
        doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 8).fill(COLORS.accentSoft);
        line(doc, "INTERESTED IN THIS PROPERTY?", MARGIN + 20, y + blockH / 2 - 16, {
          size: 8,
          font: "Helvetica-Bold",
          color: COLORS.accent,
          spacing: 1.2,
        });
        line(doc, `Contact ${orgName} to arrange a private viewing.`, MARGIN + 20, y + blockH / 2 - 2, {
          size: 13,
          font: "Helvetica-Bold",
          color: COLORS.ink,
          width: CONTENT_W - 40,
        });
      }

      // Footer
      doc.rect(0, PAGE_H - 44, PAGE_W, 44).fill(COLORS.dark);
      doc.rect(0, PAGE_H - 44, PAGE_W, 2).fill(COLORS.mark);
      line(doc, orgName, MARGIN, PAGE_H - 27, {
        size: 9,
        font: "Helvetica-Bold",
        color: COLORS.white,
        width: 320,
      });
      line(
        doc,
        `Generated ${formatDate(new Date())}. Details subject to change without notice.`,
        MARGIN,
        PAGE_H - 27,
        { size: 7, color: "#8b949e", width: CONTENT_W, align: "right" },
      );
    },
    { Title: `${listing.title} - Brochure`, Author: orgName },
  );
}
