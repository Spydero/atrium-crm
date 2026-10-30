const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || JSON.stringify(err) || "Request failed");
  }
  return res.json() as Promise<T>;
}

export function formatAed(n: number) {
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 1 : 2)}M`;
  return `AED ${n.toLocaleString()}`;
}

export const STAGES = ["NEW", "QUALIFIED", "VIEWING", "OFFER", "WON", "LOST"] as const;
export const PORTALS = ["BAYUT", "PROPERTY_FINDER", "DUBIZZLE", "SKYLOOV"] as const;

export function portalLabel(p: string) {
  return (
    {
      BAYUT: "Bayut",
      PROPERTY_FINDER: "PropertyFinder",
      DUBIZZLE: "Dubizzle",
      SKYLOOV: "Skyloov",
      WHATSAPP: "WhatsApp",
      META: "Meta",
      MANUAL: "Manual",
      REFERRAL: "Referral",
      WEBSITE: "Website",
    } as Record<string, string>
  )[p] || p;
}
