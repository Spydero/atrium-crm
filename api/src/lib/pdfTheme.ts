import type PDFKit from "pdfkit";

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 48;
export const CONTENT_W = PAGE_W - MARGIN * 2;

export const COLORS = {
  navy: "#14213d",
  navySoft: "#1f3157",
  gold: "#a68a4b",
  goldLight: "#d9c48f",
  ink: "#1a1a1a",
  body: "#333a45",
  muted: "#6b7280",
  line: "#cfd4db",
  hair: "#e3e6ea",
  tint: "#f5f6f8",
  white: "#ffffff",
};

export type Doc = InstanceType<typeof PDFKit>;

export type PdfFont =
  | "Helvetica"
  | "Helvetica-Bold"
  | "Times-Roman"
  | "Times-Bold"
  | "Times-Italic";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** 31 October 2026 */
export function longDate(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Accepts a YYYY-MM-DD key. */
export function longDateFromKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function money(n: number, label: string) {
  return `${label} ${n.toLocaleString("en-US")}`;
}

/** Single-line text that never wraps; truncates with "..." when a width is given. */
export function line(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    font?: PdfFont;
    color?: string;
    width?: number;
    align?: "left" | "center" | "right";
    spacing?: number;
    opacity?: number;
  } = {},
) {
  doc.save();
  if (opts.opacity != null) doc.fillOpacity(opts.opacity);
  doc
    .font(opts.font || "Helvetica")
    .fontSize(opts.size || 10)
    .fillColor(opts.color || COLORS.ink);
  const spacing = opts.spacing || 0;
  let out = text;
  if (opts.width != null) {
    const measure = (s: string) => doc.widthOfString(s, { characterSpacing: spacing });
    if (measure(out) > opts.width) {
      while (out.length > 1 && measure(`${out}...`) > opts.width) out = out.slice(0, -1);
      out = `${out.trimEnd()}...`;
    }
  }
  doc.text(out, x, y, {
    width: opts.width != null ? opts.width + 2 : undefined,
    align: opts.align || "left",
    lineBreak: false,
    characterSpacing: spacing,
  });
  doc.restore();
}

export function hairline(doc: Doc, x1: number, y: number, x2: number, color = COLORS.line, w = 0.5) {
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(w).strokeColor(color).stroke();
}

/** Section heading: small caps label with a full-width rule and a gold accent. */
export function sectionHeading(doc: Doc, text: string, x: number, y: number, w: number) {
  line(doc, text.toUpperCase(), x, y, {
    size: 8,
    font: "Helvetica-Bold",
    color: COLORS.navy,
    spacing: 1.6,
  });
  hairline(doc, x, y + 15, x + w, COLORS.line, 0.5);
  hairline(doc, x, y + 15, x + 34, COLORS.gold, 1.6);
}

/** Letterhead used on every page. Occupies y 0..58. */
export function pageHeader(doc: Doc, orgName: string, label: string) {
  line(doc, orgName.toUpperCase(), MARGIN, 28, {
    size: 12,
    font: "Times-Bold",
    color: COLORS.navy,
    spacing: 2.2,
    width: 340,
  });
  line(doc, label.toUpperCase(), MARGIN, 32, {
    size: 7,
    font: "Helvetica",
    color: COLORS.muted,
    spacing: 1.8,
    width: CONTENT_W,
    align: "right",
  });
  hairline(doc, MARGIN, 50, PAGE_W - MARGIN, COLORS.navy, 1.4);
  hairline(doc, MARGIN, 54, PAGE_W - MARGIN, COLORS.gold, 0.5);
}

/** Footer used on every page. Occupies y (PAGE_H - 44)..PAGE_H. */
export function pageFooter(
  doc: Doc,
  orgName: string,
  page: number,
  total: number,
  note: string,
) {
  const y = PAGE_H - 44;
  hairline(doc, MARGIN, y, PAGE_W - MARGIN, COLORS.line, 0.5);
  line(doc, orgName, MARGIN, y + 11, {
    size: 7.5,
    font: "Helvetica-Bold",
    color: COLORS.navy,
    width: 200,
  });
  line(doc, `Page ${page} of ${total}`, MARGIN, y + 11, {
    size: 7.5,
    color: COLORS.muted,
    width: CONTENT_W,
    align: "center",
  });
  line(doc, note, MARGIN, y + 11, {
    size: 7.5,
    font: "Times-Italic",
    color: COLORS.muted,
    width: CONTENT_W,
    align: "right",
  });
}

export async function fetchBuffer(
  url: string | null | undefined,
  maxBytes = 5_000_000,
): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AtriumCRM/1.1 (pdf export)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.length > maxBytes) return null;
    // pdfkit supports JPEG and PNG only
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    if (!isJpeg && !isPng) return null;
    return buf;
  } catch {
    return null;
  }
}

export function docToBuffer(
  build: (doc: Doc) => Promise<void> | void,
  info: { Title: string; Author: string },
): Promise<Buffer> {
  return import("pdfkit").then(
    ({ default: PDFDocument }) =>
      new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: "A4",
          margin: 0,
          info,
          autoFirstPage: true,
        });
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        Promise.resolve(build(doc as Doc))
          .then(() => doc.end())
          .catch(reject);
      }),
  );
}
