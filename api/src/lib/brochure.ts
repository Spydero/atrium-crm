import type { Listing, Organization } from "@prisma/client";
import {
  COLORS,
  CONTENT_W,
  MARGIN,
  PAGE_H,
  PAGE_W,
  docToBuffer,
  fetchBuffer,
  hairline,
  line,
  longDate,
  money,
  pageFooter,
  pageHeader,
  sectionHeading,
  type Doc,
} from "./pdfTheme.js";

type ListingWithOrg = Listing & {
  organization: Pick<Organization, "name" | "currencyLabel">;
};

const FOOTER_TOP = PAGE_H - 44;

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
    px: (x - (tx - 1)) * 256,
    py: (y - (ty - 1)) * 256,
  };
}

// ---------- drawing helpers ----------
function drawImageCover(doc: Doc, img: Buffer | null, x: number, y: number, w: number, h: number) {
  doc.save();
  doc.rect(x, y, w, h).clip();
  let ok = false;
  if (img) {
    try {
      doc.image(img, x, y, { cover: [w, h], align: "center", valign: "center" });
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    const g = doc.linearGradient(x, y, x + w, y + h);
    g.stop(0, COLORS.navySoft).stop(1, COLORS.navy);
    doc.rect(x, y, w, h).fill(g);
  }
  doc.restore();
  doc.rect(x, y, w, h).lineWidth(0.6).strokeColor(COLORS.navy).stroke();
}

function detailRow(doc: Doc, x: number, y: number, w: number, label: string, value: string) {
  line(doc, label.toUpperCase(), x, y + 8, {
    size: 6.5,
    font: "Helvetica-Bold",
    color: COLORS.muted,
    spacing: 1,
    width: 66,
  });
  line(doc, value, x + 72, y + 5.5, {
    size: 10.5,
    font: "Times-Roman",
    color: COLORS.ink,
    width: w - 72,
  });
  hairline(doc, x, y + 24, x + w, COLORS.hair, 0.6);
}

function titleCase(s: string) {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
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
  const currency = listing.organization.currencyLabel || "AED";
  const totalPages = photos.length ? 2 : 1;
  const place =
    [listing.building, listing.community, listing.city].filter(Boolean).join(", ") ||
    listing.address ||
    "Location available on request";
  const noBedrooms = listing.propertyType === "OFFICE" || listing.propertyType === "LAND";
  const beds = listing.beds > 0 ? String(listing.beds) : noBedrooms ? "N/A" : "Studio";
  const status = titleCase(listing.status);
  const ref = listing.id.slice(-6).toUpperCase();
  const footerNote = "Subject to availability. Particulars are not guaranteed.";

  return docToBuffer(
    (doc) => {
      doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.white);

      // ===== Page 1 =====
      pageHeader(doc, orgName, "Property Particulars");

      // Photograph + price band
      const heroY = 72;
      const heroH = 205;
      drawImageCover(doc, cover, MARGIN, heroY, CONTENT_W, heroH);
      const bandY = heroY + heroH;
      doc.rect(MARGIN, bandY, CONTENT_W, 44).fill(COLORS.navy);
      doc.rect(MARGIN, bandY, CONTENT_W, 2).fill(COLORS.gold);
      line(doc, "ASKING PRICE", MARGIN + 16, bandY + 10, {
        size: 6.5,
        font: "Helvetica-Bold",
        color: COLORS.goldLight,
        spacing: 1.6,
      });
      line(doc, money(listing.priceAed, currency), MARGIN + 16, bandY + 21, {
        size: 18,
        font: "Times-Bold",
        color: COLORS.white,
        width: 300,
      });
      line(doc, `REF ${ref}`, MARGIN, bandY + 12, {
        size: 7,
        font: "Helvetica-Bold",
        color: COLORS.goldLight,
        spacing: 1.4,
        width: CONTENT_W - 16,
        align: "right",
      });
      line(doc, status, MARGIN, bandY + 24, {
        size: 10.5,
        font: "Times-Italic",
        color: COLORS.white,
        width: CONTENT_W - 16,
        align: "right",
      });

      // Title and location
      let y = bandY + 44 + 20;
      line(doc, listing.title, MARGIN, y, {
        size: 24,
        font: "Times-Bold",
        color: COLORS.navy,
        width: CONTENT_W,
      });
      y += 31;
      line(doc, place, MARGIN, y, {
        size: 12,
        font: "Times-Italic",
        color: COLORS.muted,
        width: CONTENT_W,
      });

      // Specification table
      y += 26;
      const specH = 46;
      hairline(doc, MARGIN, y, PAGE_W - MARGIN, COLORS.navy, 1);
      hairline(doc, MARGIN, y + specH, PAGE_W - MARGIN, COLORS.line, 0.6);
      const specs: [string, string][] = [
        [beds, "Bedrooms"],
        [String(listing.baths), "Bathrooms"],
        [`${listing.areaSqft.toLocaleString("en-US")} sq ft`, "Internal area"],
        [titleCase(listing.propertyType), "Property type"],
      ];
      const colW = CONTENT_W / specs.length;
      specs.forEach(([value, label], i) => {
        const cx = MARGIN + i * colW;
        if (i > 0) {
          doc
            .moveTo(cx, y + 9)
            .lineTo(cx, y + specH - 9)
            .lineWidth(0.5)
            .strokeColor(COLORS.line)
            .stroke();
        }
        line(doc, value, cx, y + 9, {
          size: 16,
          font: "Times-Bold",
          color: COLORS.navy,
          width: colW,
          align: "center",
        });
        line(doc, label.toUpperCase(), cx, y + 31, {
          size: 6.5,
          font: "Helvetica-Bold",
          color: COLORS.muted,
          spacing: 1.2,
          width: colW,
          align: "center",
        });
      });

      // Description
      y += specH + 20;
      sectionHeading(doc, "Description", MARGIN, y, CONTENT_W);
      const about =
        listing.description?.trim() ||
        `${noBedrooms ? "A" : beds === "Studio" ? "A studio" : `A ${listing.beds} bedroom`} ${listing.propertyType.toLowerCase()} located in ${listing.community}${listing.city ? `, ${listing.city}` : ""}. Further information and viewing arrangements are available on request from ${orgName}.`;
      doc.font("Times-Roman").fontSize(10.5);
      const aboutH = Math.min(
        60,
        doc.heightOfString(about, { width: CONTENT_W, lineGap: 3 }),
      );
      doc.fillColor(COLORS.body).text(about, MARGIN, y + 24, {
        width: CONTENT_W,
        height: 60,
        lineGap: 3,
        align: "justify",
        ellipsis: true,
      });

      // Particulars
      y += 24 + aboutH + 18;
      sectionHeading(doc, "Particulars", MARGIN, y, CONTENT_W);
      const gutter = 28;
      const halfW = (CONTENT_W - gutter) / 2;
      const colX = (c: number) => MARGIN + c * (halfW + gutter);
      const ry = (r: number) => y + 22 + r * 25;
      detailRow(doc, colX(0), ry(0), halfW, "Community", listing.community);
      detailRow(doc, colX(1), ry(0), halfW, "City", listing.city || "-");
      detailRow(doc, colX(0), ry(1), halfW, "Building", listing.building || "-");
      detailRow(doc, colX(1), ry(1), halfW, "Status", status);
      detailRow(doc, MARGIN, ry(2), CONTENT_W, "Address", listing.address || place);
      detailRow(doc, colX(0), ry(3), halfW, "Listed", longDate(new Date(listing.createdAt)));
      detailRow(doc, colX(1), ry(3), halfW, "Reference", ref);

      // Location
      y += 22 + 4 * 25 + 14;
      sectionHeading(doc, "Location", MARGIN, y, CONTENT_W);
      const mapY = y + 24;
      const mapH = Math.max(60, FOOTER_TOP - 10 - mapY);
      if (map) {
        doc.save();
        doc.rect(MARGIN, mapY, CONTENT_W, mapH).clip();
        doc.rect(MARGIN, mapY, CONTENT_W, mapH).fill(COLORS.tint);
        for (const t of map.tiles) {
          const tx = MARGIN + CONTENT_W / 2 - map.px + (t.dx + 1) * 256;
          const ty = mapY + mapH / 2 - map.py + (t.dy + 1) * 256;
          try {
            doc.image(t.buf, tx, ty, { width: 256, height: 256 });
          } catch {
            /* skip broken tile */
          }
        }
        doc.restore();
        const cx = MARGIN + CONTENT_W / 2;
        const cy = mapY + mapH / 2;
        doc.circle(cx, cy, 8.5).fill(COLORS.navy);
        doc.circle(cx, cy, 8.5).lineWidth(2).strokeColor(COLORS.white).stroke();
        doc.circle(cx, cy, 2.8).fill(COLORS.gold);
        doc.rect(MARGIN, mapY, CONTENT_W, mapH).lineWidth(0.6).strokeColor(COLORS.navy).stroke();
        doc.rect(MARGIN + 8, mapY + 8, 190, 20).fill(COLORS.white);
        doc.rect(MARGIN + 8, mapY + 8, 2.5, 20).fill(COLORS.gold);
        line(doc, place, MARGIN + 16, mapY + 14, {
          size: 8,
          font: "Times-Bold",
          color: COLORS.navy,
          width: 174,
        });
        line(doc, "Map data OpenStreetMap contributors", MARGIN, mapY + mapH - 11, {
          size: 6,
          color: COLORS.muted,
          width: CONTENT_W - 6,
          align: "right",
        });
      } else {
        doc.rect(MARGIN, mapY, CONTENT_W, mapH).fill(COLORS.tint);
        doc.rect(MARGIN, mapY, CONTENT_W, mapH).lineWidth(0.5).strokeColor(COLORS.line).stroke();
        line(doc, `To arrange a viewing, please contact ${orgName}.`, MARGIN, mapY + mapH / 2 - 7, {
          size: 12,
          font: "Times-Italic",
          color: COLORS.navy,
          width: CONTENT_W,
          align: "center",
        });
      }

      pageFooter(doc, orgName, 1, totalPages, footerNote);

      // ===== Page 2: photographs =====
      if (photos.length) {
        doc.addPage();
        doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.white);
        pageHeader(doc, orgName, "Property Particulars");
        line(doc, listing.title, MARGIN, 76, {
          size: 18,
          font: "Times-Bold",
          color: COLORS.navy,
          width: CONTENT_W,
        });
        line(doc, place, MARGIN, 99, {
          size: 10.5,
          font: "Times-Italic",
          color: COLORS.muted,
          width: CONTENT_W,
        });
        sectionHeading(doc, "Photographs", MARGIN, 128, CONTENT_W);

        let py = 154;
        const n = photos.length;
        if (n === 1) {
          drawImageCover(doc, photos[0], MARGIN, py, CONTENT_W, 370);
          py += 370;
        } else if (n === 2) {
          drawImageCover(doc, photos[0], MARGIN, py, CONTENT_W, 255);
          drawImageCover(doc, photos[1], MARGIN, py + 255 + 14, CONTENT_W, 255);
          py += 255 * 2 + 14;
        } else {
          drawImageCover(doc, photos[0], MARGIN, py, CONTENT_W, 270);
          const pw = (CONTENT_W - 14) / 2;
          drawImageCover(doc, photos[1], MARGIN, py + 270 + 14, pw, 190);
          drawImageCover(doc, photos[2], MARGIN + pw + 14, py + 270 + 14, pw, 190);
          py += 270 + 14 + 190;
        }

        // Enquiries
        const ey = Math.min(py + 22, FOOTER_TOP - 62);
        doc.rect(MARGIN, ey, CONTENT_W, 46).fill(COLORS.navy);
        doc.rect(MARGIN, ey, 3, 46).fill(COLORS.gold);
        line(doc, "ENQUIRIES", MARGIN + 18, ey + 11, {
          size: 6.5,
          font: "Helvetica-Bold",
          color: COLORS.goldLight,
          spacing: 1.6,
        });
        line(doc, `To arrange a private viewing of this property, please contact ${orgName}.`, MARGIN + 18, ey + 24, {
          size: 11,
          font: "Times-Roman",
          color: COLORS.white,
          width: CONTENT_W - 36,
        });

        pageFooter(doc, orgName, 2, totalPages, footerNote);
      }
    },
    { Title: `${listing.title} - Property Particulars`, Author: orgName },
  );
}
