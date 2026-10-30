import {
  COLORS,
  CONTENT_W,
  MARGIN,
  PAGE_H,
  PAGE_W,
  docToBuffer,
  hairline,
  line,
  longDate,
  pageFooter,
  pageHeader,
  type Doc,
} from "./pdfTheme.js";

export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "checklist"; items: string[] }
  | { type: "callout"; title: string; text: string };

export type GuideChapter = { title: string; blocks: GuideBlock[] };

export type GuideDoc = {
  org: { name: string; licenseLabel?: string | null; licenseNumber?: string | null };
  title: string;
  subtitle: string;
  audienceLabel: string;
  intro: string;
  chapters: GuideChapter[];
  closing: { heading: string; text: string };
  updated?: Date;
};

const BOTTOM = PAGE_H - 70;

/**
 * Formal multi-page guide in the same style as the brochure and report.
 * Used for the demo guides. Uploaded PDFs are stored as they are.
 */
export async function buildGuidePdf(g: GuideDoc): Promise<Buffer> {
  // First pass counts the pages so every footer can say "Page n of N"
  let count = 0;
  await docToBuffer((doc) => {
    count = renderGuide(doc, g, 0);
  }, { Title: g.title, Author: g.org.name });
  return docToBuffer((doc) => {
    renderGuide(doc, g, count);
  }, { Title: g.title, Author: g.org.name });
}

function renderGuide(doc: Doc, g: GuideDoc, totalPages: number): number {
  const updated = g.updated ?? new Date();
  {
    {
      // ---- Cover ----
      doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.navy);
      doc.rect(24, 24, PAGE_W - 48, PAGE_H - 48).lineWidth(0.6).strokeColor(COLORS.gold).strokeOpacity(0.55).stroke();
      doc.strokeOpacity(1);
      doc.rect(MARGIN, 120, 54, 3).fill(COLORS.gold);
      line(doc, g.org.name.toUpperCase(), MARGIN, 84, {
        size: 12,
        font: "Times-Bold",
        color: COLORS.goldLight,
        spacing: 2.6,
        width: CONTENT_W,
      });
      line(doc, g.audienceLabel.toUpperCase(), MARGIN, 150, {
        size: 8,
        font: "Helvetica-Bold",
        color: COLORS.goldLight,
        spacing: 2,
      });
      doc.font("Times-Bold").fontSize(40).fillColor(COLORS.white);
      const th = doc.heightOfString(g.title, { width: CONTENT_W - 40, lineGap: 4 });
      doc.text(g.title, MARGIN, 190, { width: CONTENT_W - 40, lineGap: 4 });
      doc.font("Times-Italic").fontSize(16).fillColor(COLORS.goldLight);
      doc.text(g.subtitle, MARGIN, 190 + th + 18, { width: CONTENT_W - 80, lineGap: 3 });
      hairline(doc, MARGIN, PAGE_H - 120, PAGE_W - MARGIN, COLORS.gold, 0.8);
      line(doc, `Updated ${longDate(updated)}`, MARGIN, PAGE_H - 100, {
        size: 9,
        color: COLORS.white,
        opacity: 0.8,
      });
      if (g.org.licenseNumber) {
        line(doc, `${g.org.licenseLabel || "Licence no."} ${g.org.licenseNumber}`, MARGIN, PAGE_H - 84, {
          size: 9,
          color: COLORS.white,
          opacity: 0.8,
        });
      }

      // ---- Contents + intro ----
      let pageNo = 1;
      const newPage = () => {
        doc.addPage();
        pageNo += 1;
        doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.white);
        pageHeader(doc, g.org.name, g.title);
        pageFooter(doc, g.org.name, pageNo, totalPages, g.title);
        return 84;
      };

      let y = newPage();
      line(doc, "WELCOME", MARGIN, y, {
        size: 8,
        font: "Helvetica-Bold",
        color: COLORS.gold,
        spacing: 2,
      });
      y += 22;
      doc.font("Times-Roman").fontSize(13);
      const ih = doc.heightOfString(g.intro, { width: CONTENT_W, lineGap: 5 });
      doc.fillColor(COLORS.body).text(g.intro, MARGIN, y, { width: CONTENT_W, lineGap: 5 });
      y += ih + 34;
      line(doc, "In this guide", MARGIN, y, { size: 18, font: "Times-Bold", color: COLORS.navy });
      y += 32;
      g.chapters.forEach((c, i) => {
        hairline(doc, MARGIN, y - 6, PAGE_W - MARGIN, COLORS.hair, 0.5);
        line(doc, String(i + 1).padStart(2, "0"), MARGIN, y + 2, {
          size: 11,
          font: "Times-Bold",
          color: COLORS.gold,
        });
        line(doc, c.title, MARGIN + 36, y + 2, {
          size: 13,
          font: "Times-Roman",
          color: COLORS.ink,
          width: CONTENT_W - 36,
        });
        y += 30;
      });

      // ---- Chapters ----
      const ensure = (need: number) => {
        if (y + need > BOTTOM) y = newPage();
      };

      g.chapters.forEach((c, i) => {
        if (i === 0 && y < 560) {
          y += 36; // chapter one follows the contents on the same page
        } else if (y > 540) {
          y = newPage();
        } else {
          y += 32;
        }
        line(doc, `CHAPTER ${i + 1}`, MARGIN, y, {
          size: 8,
          font: "Helvetica-Bold",
          color: COLORS.gold,
          spacing: 2,
        });
        y += 20;
        doc.font("Times-Bold").fontSize(26).fillColor(COLORS.navy);
        const ch = doc.heightOfString(c.title, { width: CONTENT_W, lineGap: 2 });
        doc.text(c.title, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
        y += ch + 8;
        doc.rect(MARGIN, y, 44, 2.5).fill(COLORS.gold);
        y += 24;

        for (const b of c.blocks) {
          if (b.type === "h") {
            ensure(40);
            line(doc, b.text, MARGIN, y, { size: 13.5, font: "Times-Bold", color: COLORS.navy, width: CONTENT_W });
            y += 24;
          } else if (b.type === "p") {
            doc.font("Times-Roman").fontSize(11);
            const h = doc.heightOfString(b.text, { width: CONTENT_W, lineGap: 4 });
            ensure(h + 8);
            doc.fillColor(COLORS.body).text(b.text, MARGIN, y, { width: CONTENT_W, lineGap: 4 });
            y += h + 12;
          } else if (b.type === "bullets" || b.type === "checklist") {
            for (const item of b.items) {
              doc.font("Times-Roman").fontSize(11);
              const h = doc.heightOfString(item, { width: CONTENT_W - 26, lineGap: 3 });
              ensure(h + 6);
              if (b.type === "bullets") {
                doc.circle(MARGIN + 5, y + 6.5, 2).fill(COLORS.gold);
              } else {
                doc.rect(MARGIN, y + 1.5, 11, 11).lineWidth(0.9).strokeColor(COLORS.navy).stroke();
              }
              doc.fillColor(COLORS.body).text(item, MARGIN + 26, y, { width: CONTENT_W - 26, lineGap: 3 });
              y += h + 8;
            }
            y += 6;
          } else if (b.type === "callout") {
            doc.font("Times-Roman").fontSize(10.5);
            const h = doc.heightOfString(b.text, { width: CONTENT_W - 36, lineGap: 3 });
            const boxH = h + 48;
            ensure(boxH + 8);
            doc.rect(MARGIN, y, CONTENT_W, boxH).fill(COLORS.tint);
            doc.rect(MARGIN, y, 3, boxH).fill(COLORS.gold);
            line(doc, b.title.toUpperCase(), MARGIN + 18, y + 14, {
              size: 7.5,
              font: "Helvetica-Bold",
              color: COLORS.navy,
              spacing: 1.6,
              width: CONTENT_W - 36,
            });
            doc.font("Times-Roman").fontSize(10.5);
            doc.fillColor(COLORS.body).text(b.text, MARGIN + 18, y + 30, { width: CONTENT_W - 36, lineGap: 3 });
            y += boxH + 16;
          }
        }
      });

      // ---- Closing ----
      if (y + 330 > BOTTOM) y = newPage();
      else y += 20;
      doc.rect(MARGIN, y + 20, CONTENT_W, 190).fill(COLORS.navy);
      line(doc, "NEXT STEP", MARGIN + 28, y + 46, {
        size: 8,
        font: "Helvetica-Bold",
        color: COLORS.goldLight,
        spacing: 2,
      });
      doc.font("Times-Bold").fontSize(24).fillColor(COLORS.white);
      doc.text(g.closing.heading, MARGIN + 28, y + 66, { width: CONTENT_W - 56 });
      doc.font("Times-Roman").fontSize(11.5).fillColor(COLORS.white);
      doc.text(g.closing.text, MARGIN + 28, y + 106, { width: CONTENT_W - 56, lineGap: 4 });
      line(doc, g.org.name, MARGIN + 28, y + 176, {
        size: 11,
        font: "Times-Bold",
        color: COLORS.goldLight,
        width: CONTENT_W - 56,
      });
      const fine =
        "This guide is general information and is not legal, tax or financial advice. Rules and fees differ by location and change over time, so check current requirements with the relevant authority or a qualified professional before you act.";
      doc.font("Times-Italic").fontSize(9).fillColor(COLORS.muted);
      doc.text(fine, MARGIN, y + 240, { width: CONTENT_W, lineGap: 3 });

      return pageNo;
    }
  }
}
