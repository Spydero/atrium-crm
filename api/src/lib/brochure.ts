import PDFDocument from "pdfkit";
import type { Listing, Organization } from "@prisma/client";

type ListingWithOrg = Listing & { organization: Pick<Organization, "name" | "currencyLabel"> };

function money(n: number, label: string) {
  if (n >= 1_000_000) {
    return `${label} ${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 1 : 2)}M`;
  }
  return `${label} ${n.toLocaleString()}`;
}

async function fetchImage(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AtriumCRM/1.1 brochure" },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("image") && !ctype.includes("octet-stream")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.length > 4_000_000) return null;
    return buf;
  } catch {
    return null;
  }
}

export async function buildBrochurePdf(listing: ListingWithOrg): Promise<Buffer> {
  const img = await fetchImage(listing.coverUrl);
  const currency = listing.organization.currencyLabel || "AED";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .fillColor("#101418")
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(listing.organization.name.toUpperCase(), { characterSpacing: 1.5 });

    doc.moveDown(0.4);
    doc
      .fillColor("#1a5f7a")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("PROPERTY BROCHURE");

    doc.moveDown(0.8);
    doc
      .fillColor("#101418")
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(listing.title, { width: 500 });

    doc.moveDown(0.3);
    doc
      .fillColor("#66707a")
      .fontSize(11)
      .font("Helvetica")
      .text(
        [listing.community, listing.city].filter(Boolean).join(", ") ||
          listing.address ||
          "Location on request",
      );

    doc.moveDown(0.6);
    doc
      .fillColor("#101418")
      .fontSize(18)
      .font("Helvetica-Bold")
      .text(money(listing.priceAed, currency));

    if (img) {
      try {
        doc.moveDown(0.8);
        doc.image(img, {
          fit: [500, 260],
          align: "center",
        });
      } catch {
        /* skip bad image */
      }
    }

    doc.moveDown(1);
    doc.fillColor("#101418").fontSize(12).font("Helvetica-Bold").text("Highlights");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(11).fillColor("#334155");
    doc.text(`Type: ${listing.propertyType}`);
    doc.text(`Beds: ${listing.beds}   Baths: ${listing.baths}   Area: ${listing.areaSqft.toLocaleString()} sqft`);
    doc.text(`Status: ${listing.status}`);
    if (listing.building) doc.text(`Building: ${listing.building}`);
    if (listing.address) doc.text(`Address: ${listing.address}`);

    if (listing.description?.trim()) {
      doc.moveDown(0.8);
      doc.fillColor("#101418").fontSize(12).font("Helvetica-Bold").text("Description");
      doc.moveDown(0.3);
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#334155")
        .text(listing.description.trim(), { width: 500, align: "left" });
    }

    doc.moveDown(1.5);
    doc
      .fontSize(9)
      .fillColor("#94a3b8")
      .text("Prepared with Atrium - for illustration in brokerage demos.", {
        width: 500,
      });

    doc.end();
  });
}
