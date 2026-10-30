/**
 * Pure helpers for the guides feature. No database access, so the rules can be unit tested.
 */
import crypto from "node:crypto";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const CONSENT_VERSION = 1;

/** URL safe slug: lowercase letters, digits and single hyphens. */
export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "guide";
}

/** Pick a slug that is not in `taken` by appending -2, -3 ... */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Long random token for personal download links. */
export function makeToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** One way hash so we can rate limit and spot abuse without storing IP addresses. */
export function hashIp(ip: string | undefined, secret: string): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(`${secret}:${ip}`).digest("hex").slice(0, 16);
}

export type PdfCheck = { ok: true; pageCount: number | null } | { ok: false; error: string };

/** Accepts only real PDFs: header check, size cap and end-of-file marker. */
export function checkPdf(buf: Buffer): PdfCheck {
  if (buf.length < 64) return { ok: false, error: "That file is empty or too small to be a PDF" };
  if (buf.length > MAX_PDF_BYTES) {
    return { ok: false, error: `PDF is too large (max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB)` };
  }
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { ok: false, error: "That file is not a PDF" };
  }
  const tail = buf.subarray(Math.max(0, buf.length - 1024)).toString("latin1");
  if (!tail.includes("%%EOF")) return { ok: false, error: "The PDF looks damaged (no end marker)" };
  return { ok: true, pageCount: pdfPageCount(buf) };
}

/** Best effort page count. Returns null when the PDF uses compressed object streams. */
export function pdfPageCount(buf: Buffer): number | null {
  const text = buf.toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (counts.length) return Math.max(...counts);
  const alt = [...text.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)].map((m) => Number(m[1]));
  if (alt.length) return Math.max(...alt);
  const pages = text.match(/\/Type\s*\/Page[^s]/g);
  return pages?.length ? pages.length : null;
}

export type ImageCheck = { ok: true; ext: "jpg" | "png" | "webp" } | { ok: false; error: string };

export function checkImage(buf: Buffer): ImageCheck {
  if (buf.length < 100) return { ok: false, error: "That image is too small" };
  if (buf.length > 5 * 1024 * 1024) return { ok: false, error: "Image is too large (max 5 MB)" };
  if (buf[0] === 0xff && buf[1] === 0xd8) return { ok: true, ext: "jpg" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ok: true, ext: "png" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return { ok: true, ext: "webp" };
  }
  return { ok: false, error: "Cover must be a JPEG, PNG or WebP image" };
}

/** Wording stored with every marketing opt-in so consent is provable. */
export function consentWording(orgName: string): string {
  return `Yes, send me property news and offers from ${orgName}. I can unsubscribe at any time.`;
}

/** Next Monday to Friday at 10:00 local time, strictly after `from`. */
export function nextBusinessDay(from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const clip = (v: unknown, n: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, n) : null;
};

/** Marketing parameters from the public form. Anything unexpected is dropped. */
export function cleanUtm(input: unknown): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
} {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const lower = (v: unknown, n: number) => clip(v, n)?.toLowerCase().replace(/[^a-z0-9_.\- ]/g, "") || null;
  let referrer = clip(o.referrer, 300);
  if (referrer) {
    try {
      const u = new URL(referrer);
      referrer = u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
    } catch {
      referrer = null;
    }
  }
  return {
    utmSource: lower(o.utmSource, 60),
    utmMedium: lower(o.utmMedium, 60),
    utmCampaign: lower(o.utmCampaign, 80),
    referrer,
  };
}

/** Simple in-memory sliding window limiter. Fine for one API process. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  /** Returns true when the call is allowed (and records it). */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    }
    return true;
  }
  reset() {
    this.hits.clear();
  }
}

export function utmLink(base: string, p: { source?: string; medium?: string; campaign?: string }): string {
  const u = new URL(base);
  if (p.source) u.searchParams.set("utm_source", p.source);
  if (p.medium) u.searchParams.set("utm_medium", p.medium);
  if (p.campaign) u.searchParams.set("utm_campaign", p.campaign);
  return u.toString();
}

const SOURCE_NAMES: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X",
  x: "X",
  newsletter: "Newsletter",
};
const MEDIUM_NAMES: Record<string, string> = {
  social: "social",
  email: "email",
  cpc: "paid ads",
  ppc: "paid ads",
  qr: "QR code",
  share: "shared link",
};

function sentence(s: string): string {
  const t = s.replace(/[-_]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Friendly channel name from campaign tags or referrer, used in reports and logs. */
export function channelLabel(
  source: string | null | undefined,
  medium: string | null | undefined,
  referrer?: string | null,
): string {
  if (source) {
    const name = SOURCE_NAMES[source.toLowerCase()] ?? sentence(source);
    if (!medium) return name;
    const m = MEDIUM_NAMES[medium.toLowerCase()] ?? medium.replace(/[-_]+/g, " ");
    return `${name} (${m})`;
  }
  if (referrer) {
    try {
      return `${new URL(referrer).hostname.replace(/^www\./, "")} (referral)`;
    } catch {
      /* fall through */
    }
  }
  return "Direct";
}
