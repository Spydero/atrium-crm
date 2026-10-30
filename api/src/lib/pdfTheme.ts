import type PDFKit from "pdfkit";

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 40;

export const COLORS = {
  ink: "#101418",
  body: "#334155",
  muted: "#66707a",
  line: "#d7dce2",
  track: "#eef1f4",
  paper: "#f6f8fa",
  accent: "#1a5f7a",
  accentSoft: "#d7ebf2",
  accentLight: "#8fc3d6",
  teal: "#0d9488",
  mark: "#c45c26",
  green: "#15803d",
  dark: "#12161a",
  white: "#ffffff",
};

export type Doc = InstanceType<typeof PDFKit>;

export function money(n: number, label: string) {
  if (n >= 1_000_000) {
    return `${label} ${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 1 : 2)}M`;
  }
  return `${label} ${n.toLocaleString("en-US")}`;
}

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Single-line text that never wraps or adds a page. */
export function line(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    font?: "Helvetica" | "Helvetica-Bold";
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
    // Manual truncation: pdfkit wraps instead of clipping when a width is set.
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

export function sectionLabel(doc: Doc, text: string, x: number, y: number) {
  line(doc, text.toUpperCase(), x, y, {
    size: 7.5,
    font: "Helvetica-Bold",
    color: COLORS.accent,
    spacing: 1.2,
  });
  doc
    .moveTo(x, y + 13)
    .lineTo(x + 26, y + 13)
    .lineWidth(1.5)
    .strokeColor(COLORS.mark)
    .stroke();
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
