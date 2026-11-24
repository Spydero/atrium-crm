import path from "node:path";
import fs from "node:fs/promises";

export const uploadDir = path.join(process.cwd(), "uploads");

export function publicApiOrigin() {
  return new URL(process.env.PUBLIC_API_URL || process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 4000}`).origin;
}

export function mediaUrl(name: string) {
  return `${publicApiOrigin()}/uploads/${encodeURIComponent(name)}`;
}

/** Only our own upload URLs can resolve to local files, never arbitrary filesystem paths. */
export function localUploadName(value: string): string | null {
  try {
    const url = new URL(value, publicApiOrigin());
    const legacy = url.origin === "http://localhost:4000" || url.origin === `http://localhost:${process.env.PORT || 4000}`;
    if (url.origin !== publicApiOrigin() && !legacy) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const name = decodeURIComponent(url.pathname.slice("/uploads/".length));
    if (!url.pathname.startsWith("/uploads/") || !/^[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(name)) return null;
    return name;
  } catch {
    return null;
  }
}

export async function readUpload(name: string, maxBytes: number) {
  const file = await fs.open(path.join(uploadDir, name), "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const buffer = Buffer.alloc(Math.min(maxBytes + 1, stat.size + 1));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return bytesRead > maxBytes ? null : buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

/** Rebase historical localhost upload URLs when serializing API responses. */
export function presentMedia(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(presentMedia);
  if (!value || typeof value !== "object" || value instanceof Date || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const rebase = (url: unknown) => typeof url === "string" && localUploadName(url) ? mediaUrl(localUploadName(url)!) : url;
    if (key === "coverUrl") return [key, rebase(item)];
    if (key === "photoUrls" && Array.isArray(item)) return [key, item.map(rebase)];
    return [key, presentMedia(item)];
  }));
}
