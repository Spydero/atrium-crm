const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const WEB = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";

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
  if (window.location.pathname === "/login") return;
  redirectingToLogin = true;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.replace(
    next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login",
  );
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

/* ------------------------------------------------------------------ */
/* Types - see admin/README.md for the expected API contract           */
/* ------------------------------------------------------------------ */

/** Roles platform Ops may invite. Brokers are invited inside the CRM by the brokerage. */
export type MemberRole = "owner" | "admin";
export const INVITE_ROLES: MemberRole[] = ["owner", "admin"];

export type PlatformOverview = {
  organizations: number;
  pendingInvites: number;
  members?: number;
};

export type PlatformOrg = {
  id: string;
  name: string;
  slug: string;
  currencyCode?: string;
  defaultCity?: string;
  createdAt?: string;
  memberCount?: number;
  pendingInviteCount?: number;
};

export type PlatformMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt?: string;
};

export type PlatformInvite = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  token?: string;
  acceptUrl?: string;
  status?: string;
  expiresAt?: string | null;
  createdAt?: string;
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
};

export type PlatformOrgDetail = PlatformOrg & {
  members: PlatformMember[];
  invites: PlatformInvite[];
};

export type CreateOrgInput = {
  name: string;
  slug?: string;
  currencyCode: string;
  defaultCity: string;
  owner: { name: string; email: string; role: "owner" };
};

/* ------------------------------------------------------------------ */
/* Tolerant response normalisers                                       */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;

function asArray<T>(raw: unknown, ...keys: string[]): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    for (const k of keys) {
      const v = (raw as Rec)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function countOf(raw: Rec, ...keys: string[]): number {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "number") return v;
    if (Array.isArray(v)) return v.length;
  }
  return 0;
}

export function inviteUrl(inv: Pick<PlatformInvite, "token" | "acceptUrl">) {
  if (inv.token) return `${WEB}/invite/${inv.token}`;
  return inv.acceptUrl || null;
}

function normInvite(i: Rec): PlatformInvite {
  const org = (i.organization ?? null) as Rec | null;
  return {
    ...(i as unknown as PlatformInvite),
    organizationName:
      (i.organizationName as string | undefined) ??
      (org?.name as string | undefined),
    organizationSlug:
      (i.organizationSlug as string | undefined) ??
      (org?.slug as string | undefined),
  };
}

export async function getOverview(): Promise<PlatformOverview> {
  const raw = (await api<Rec>("/api/platform/overview")) ?? {};
  const counts = ((raw.counts as Rec | undefined) ?? raw) as Rec;
  return {
    organizations: countOf(counts, "organizations", "orgs", "organizationCount", "orgCount"),
    pendingInvites: countOf(counts, "pendingInvites", "invites", "pendingInviteCount"),
    members: counts.members !== undefined ? num(counts.members) : counts.memberCount !== undefined ? num(counts.memberCount) : undefined,
  };
}

export async function listOrganizations(): Promise<PlatformOrg[]> {
  const raw = await api<unknown>("/api/platform/organizations");
  return asArray<Rec>(raw, "organizations", "items", "data").map((o) => ({
    id: String(o.id),
    name: String(o.name ?? ""),
    slug: String(o.slug ?? ""),
    currencyCode: o.currencyCode as string | undefined,
    defaultCity: o.defaultCity as string | undefined,
    createdAt: o.createdAt as string | undefined,
    memberCount: num(o.users ?? o.memberCount),
    pendingInviteCount: num(o.invites ?? o.pendingInviteCount),
  }));
}

export async function getOrganization(id: string): Promise<PlatformOrgDetail> {
  const raw = await api<Rec>(`/api/platform/organizations/${encodeURIComponent(id)}`);
  const o = (raw.organization as Rec | undefined) ?? raw;
  return {
    ...(o as unknown as PlatformOrg),
    members: asArray<PlatformMember>(o.members ?? raw.members, "members"),
    invites: asArray<Rec>(
      o.invitations ?? o.invites ?? raw.invitations ?? raw.invites,
      "invitations",
      "invites",
    ).map(normInvite),
  };
}

export async function createOrganization(
  input: CreateOrgInput,
): Promise<{ id: string; raw: Rec }> {
  const raw = await api<Rec>("/api/platform/organizations", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const o = (raw?.organization as Rec | undefined) ?? raw;
  return { id: String(o.id), raw };
}

export async function createInvite(
  orgId: string,
  input: { email: string; name?: string; role: MemberRole },
): Promise<PlatformInvite> {
  const raw = await api<Rec>(
    `/api/platform/organizations/${encodeURIComponent(orgId)}/invites`,
    { method: "POST", body: JSON.stringify(input) },
  );
  const inv = (raw?.invitation as Rec | undefined) ?? (raw?.invite as Rec | undefined) ?? raw;
  const out = normInvite(inv);
  if (!out.acceptUrl && typeof (inv as Rec)?.acceptUrl === "string") {
    out.acceptUrl = (inv as Rec).acceptUrl as string;
  }
  if (!out.token && typeof (inv as Rec)?.token === "string") {
    out.token = (inv as Rec).token as string;
  }
  return out;
}

export async function listInvites(): Promise<PlatformInvite[]> {
  const raw = await api<unknown>("/api/platform/invites");
  return asArray<Rec>(raw, "invitations", "invites", "items", "data").map(normInvite);
}
