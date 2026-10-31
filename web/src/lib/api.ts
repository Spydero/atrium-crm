const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let redirectingToLogin = false;

function handleUnauthorized() {
  if (typeof window === "undefined" || redirectingToLogin) return;
  redirectingToLogin = true;
  const next = `${window.location.pathname}${window.location.search}`;
  const login =
    next && next !== "/login"
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login";
  window.location.replace(login);
}

/** Authenticated file download (PDF / CSV). Uses the filename the server suggests. */
export async function downloadFile(path: string, fallbackName: string) {
  const res = await fetch(`${API}${path}`, { credentials: "include" });
  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized();
      throw new ApiError("Session expired - sign in again", 401);
    }
    throw new ApiError("Export failed", res.status);
  }
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] || fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized();
      throw new ApiError("Session expired - sign in again", 401);
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(
      err.error || JSON.stringify(err) || "Request failed",
      res.status,
    );
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function formatMoney(n: number, currencyLabel = "AED") {
  if (n >= 1_000_000) {
    return `${currencyLabel} ${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 1 : 2)}M`;
  }
  return `${currencyLabel} ${n.toLocaleString()}`;
}

/** @deprecated Prefer formatMoney with org currencyLabel */
export function formatAed(n: number) {
  return formatMoney(n, "AED");
}

export type OrgChannel = {
  id: string;
  key: string;
  label: string;
  kind: "SYSTEM" | "PORTAL" | "ADS" | "OTHER";
  enabled: boolean;
  sortOrder: number;
};

export type OrgSettings = {
  id: string;
  name: string;
  slug: string;
  currencyCode: string;
  currencyLabel: string;
  defaultCity: string;
  channels?: OrgChannel[];
  /** @deprecated derived from enabled PORTAL channels */
  enabledPortals: string[];
  privacyUrl?: string | null;
  licenseLabel?: string;
  licenseNumber?: string | null;
};

export const STAGES = ["NEW", "QUALIFIED", "VIEWING", "OFFER", "WON", "LOST"] as const;

/** Fallback label for a channel key when OrgChannel.label is not in hand. */
export function portalLabel(p: string) {
  const key = p.trim().toLowerCase();
  const system: Record<string, string> = {
    manual: "Manual",
    referral: "Referral",
    website: "Website",
    whatsapp: "WhatsApp",
    guide: "Guide",
  };
  if (system[key]) return system[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const channelLabel = portalLabel;

export function pct(rate: number) {
  return `${Math.round(rate * 1000) / 10}%`;
}

export const API_BASE = API;
