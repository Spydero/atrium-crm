import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { localUploadName, readUpload } from "./media.js";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6) return false;
  // Restrict IPv6 to global unicast, excluding special-use/transition/documentation ranges.
  const parts = address.toLowerCase().split(":");
  const first = parseInt(parts[0], 16);
  const second = parseInt(parts[1] || "0", 16);
  return first >= 0x2000 && first <= 0x3fff &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
    first !== 0x2002 && !(first === 0x3fff && second <= 0x0fff);
}

async function remoteBuffer(url: URL, maxBytes: number, signal: AbortSignal, redirects = 0): Promise<Buffer | null> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || redirects > 3) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) return null;
  signal.throwIfAborted();
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    // Pin the checked DNS answer for this connection, including each redirect hop.
    const request = (url.protocol === "https:" ? https : http).get(url, {
      agent: false,
      family: pinned.family,
      signal,
      headers: { "User-Agent": "AtriumCRM/1.1 (pdf export)" },
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (response) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.destroy();
        try {
          resolve(remoteBuffer(new URL(response.headers.location, url), maxBytes, signal, redirects + 1));
        } catch (error) { reject(error); }
        return;
      }
      if (status !== 200 || Number(response.headers["content-length"] || 0) > maxBytes) {
        response.destroy();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          response.destroy();
          resolve(null);
        } else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
      response.on("aborted", () => resolve(null));
    });
    request.on("error", reject);
  });
}

export async function safeImageBuffer(value: string | null | undefined, maxBytes = 5_000_000): Promise<Buffer | null> {
  if (!value) return null;
  try {
    const local = localUploadName(value);
    const buffer = local ? await readUpload(local, maxBytes) :
      await remoteBuffer(new URL(value), maxBytes, AbortSignal.timeout(6000));
    if (!buffer || buffer.length < 100) return null;
    const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return jpeg || png ? buffer : null;
  } catch {
    return null;
  }
}
