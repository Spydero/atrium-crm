import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Private folder. It is NOT served statically, only through the token routes. */
export const GUIDE_DIR = path.join(process.cwd(), "storage", "guides");
fs.mkdirSync(GUIDE_DIR, { recursive: true });

export function saveGuideFile(buf: Buffer): string {
  const key = `${crypto.randomBytes(16).toString("hex")}.pdf`;
  fs.writeFileSync(path.join(GUIDE_DIR, key), buf);
  return key;
}

/** Resolve a stored key to an absolute path, refusing anything outside the folder. */
export function guideFilePath(key: string | null | undefined): string | null {
  if (!key || key !== path.basename(key)) return null;
  const full = path.join(GUIDE_DIR, key);
  if (!full.startsWith(GUIDE_DIR + path.sep)) return null;
  return fs.existsSync(full) ? full : null;
}

export function deleteGuideFile(key: string | null | undefined) {
  const p = guideFilePath(key);
  if (p) fs.rmSync(p, { force: true });
}

export function downloadName(title: string): string {
  const safe = title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${safe || "guide"}.pdf`;
}
