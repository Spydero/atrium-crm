/** Brokerage roles (within one Organization). */
export const ORG_ROLES = ["owner", "admin", "broker"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Platform operator roles (Atrium staff). */
export const PLATFORM_ROLES = ["operator", "super"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Normalize legacy "agent" to broker. */
export function normalizeOrgRole(raw: string | null | undefined): OrgRole {
  const r = (raw || "broker").toLowerCase();
  if (r === "agent") return "broker";
  if (r === "owner" || r === "admin" || r === "broker") return r;
  return "broker";
}

export function isOrgRole(raw: string): raw is OrgRole {
  const n = normalizeOrgRole(raw);
  return ORG_ROLES.includes(n) && (raw === n || raw === "agent");
}

export function parseOrgRole(raw: string): OrgRole | null {
  const r = raw.trim().toLowerCase();
  if (r === "agent") return "broker";
  if (r === "owner" || r === "admin" || r === "broker") return r;
  return null;
}

export function isPlatformOperator(platformRole: string | null | undefined) {
  return platformRole === "operator" || platformRole === "super";
}

/** Owner > admin > broker privilege checks. */
export function roleAtLeast(role: string, min: OrgRole) {
  const r = normalizeOrgRole(role);
  const rank = { owner: 3, admin: 2, broker: 1 } as const;
  return rank[r] >= rank[min];
}
