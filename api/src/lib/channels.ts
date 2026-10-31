import type { ChannelKind, OrgChannel, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type ChannelRow = Pick<
  OrgChannel,
  "id" | "key" | "label" | "kind" | "enabled" | "sortOrder"
>;

/** Product-owned channels created for every org. */
export const SYSTEM_CHANNELS: {
  key: string;
  label: string;
  kind: ChannelKind;
  sortOrder: number;
}[] = [
  { key: "manual", label: "Manual", kind: "SYSTEM", sortOrder: 10 },
  { key: "referral", label: "Referral", kind: "SYSTEM", sortOrder: 20 },
  { key: "website", label: "Website", kind: "SYSTEM", sortOrder: 30 },
  { key: "whatsapp", label: "WhatsApp", kind: "SYSTEM", sortOrder: 40 },
  { key: "guide", label: "Guide", kind: "SYSTEM", sortOrder: 50 },
];

/** Optional sample channels for the showcase demo org only. */
export const DEMO_SAMPLE_CHANNELS: {
  key: string;
  label: string;
  kind: ChannelKind;
  sortOrder: number;
}[] = [
  { key: "bayut", label: "Bayut", kind: "PORTAL", sortOrder: 100 },
  { key: "property_finder", label: "PropertyFinder", kind: "PORTAL", sortOrder: 110 },
  { key: "dubizzle", label: "Dubizzle", kind: "PORTAL", sortOrder: 120 },
  { key: "skyloov", label: "Skyloov", kind: "PORTAL", sortOrder: 130 },
  { key: "meta", label: "Meta ads", kind: "ADS", sortOrder: 200 },
];

/** Map legacy Prisma enum values / uppercase keys to catalog keys. */
export const LEGACY_SOURCE_KEY: Record<string, string> = {
  MANUAL: "manual",
  BAYUT: "bayut",
  PROPERTY_FINDER: "property_finder",
  DUBIZZLE: "dubizzle",
  SKYLOOV: "skyloov",
  WHATSAPP: "whatsapp",
  META: "meta",
  REFERRAL: "referral",
  WEBSITE: "website",
  GUIDE: "guide",
};

const LEGACY_LABEL: Record<string, string> = {
  manual: "Manual",
  bayut: "Bayut",
  property_finder: "PropertyFinder",
  dubizzle: "Dubizzle",
  skyloov: "Skyloov",
  whatsapp: "WhatsApp",
  meta: "Meta ads",
  referral: "Referral",
  website: "Website",
  guide: "Guide",
};

export function normalizeChannelKey(raw: string): string {
  const t = raw.trim();
  if (!t) return "manual";
  if (LEGACY_SOURCE_KEY[t]) return LEGACY_SOURCE_KEY[t];
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "manual";
}

export function defaultLabelForKey(key: string): string {
  if (LEGACY_LABEL[key]) return LEGACY_LABEL[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function channelLabel(
  key: string,
  catalog?: { key: string; label: string }[] | Map<string, string> | null,
): string {
  if (!catalog) return LEGACY_LABEL[key] || defaultLabelForKey(key);
  if (catalog instanceof Map) return catalog.get(key) || defaultLabelForKey(key);
  return catalog.find((c) => c.key === key)?.label || defaultLabelForKey(key);
}

export function isSystemKey(key: string) {
  return SYSTEM_CHANNELS.some((c) => c.key === key);
}

/** Ensure system channels exist. Optionally seed demo sample portals/ads. */
export async function ensureOrgChannels(
  organizationId: string,
  opts: { includeDemoSamples?: boolean; tx?: Prisma.TransactionClient } = {},
) {
  const db = opts.tx ?? prisma;
  const wanted = [
    ...SYSTEM_CHANNELS,
    ...(opts.includeDemoSamples ? DEMO_SAMPLE_CHANNELS : []),
  ];
  for (const c of wanted) {
    await db.orgChannel.upsert({
      where: {
        organizationId_key: { organizationId, key: c.key },
      },
      create: {
        organizationId,
        key: c.key,
        label: c.label,
        kind: c.kind,
        enabled: true,
        sortOrder: c.sortOrder,
      },
      update: {},
    });
  }
}

export async function listOrgChannels(
  organizationId: string,
  opts: { enabledOnly?: boolean; kinds?: ChannelKind[] } = {},
): Promise<ChannelRow[]> {
  return prisma.orgChannel.findMany({
    where: {
      organizationId,
      ...(opts.enabledOnly ? { enabled: true } : {}),
      ...(opts.kinds ? { kind: { in: opts.kinds } } : {}),
    },
    select: {
      id: true,
      key: true,
      label: true,
      kind: true,
      enabled: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

export async function enabledPortalKeys(organizationId: string): Promise<string[]> {
  const rows = await listOrgChannels(organizationId, {
    enabledOnly: true,
    kinds: ["PORTAL"],
  });
  return rows.map((r) => r.key);
}

export async function assertChannelEnabled(
  organizationId: string,
  key: string,
): Promise<ChannelRow> {
  const normalized = normalizeChannelKey(key);
  const row = await prisma.orgChannel.findUnique({
    where: {
      organizationId_key: { organizationId, key: normalized },
    },
    select: {
      id: true,
      key: true,
      label: true,
      kind: true,
      enabled: true,
      sortOrder: true,
    },
  });
  if (!row || !row.enabled) {
    throw Object.assign(new Error(`Channel "${normalized}" is not available`), {
      status: 400,
    });
  }
  return row;
}

/** Ensure a channel row exists for a key seen in data (e.g. after custom add or backfill). */
export async function ensureChannelKey(
  organizationId: string,
  key: string,
  opts: { label?: string; kind?: ChannelKind; enabled?: boolean } = {},
) {
  const normalized = normalizeChannelKey(key);
  const kind = opts.kind ?? (isSystemKey(normalized) ? "SYSTEM" : "OTHER");
  return prisma.orgChannel.upsert({
    where: { organizationId_key: { organizationId, key: normalized } },
    create: {
      organizationId,
      key: normalized,
      label: opts.label || defaultLabelForKey(normalized),
      kind,
      enabled: opts.enabled ?? true,
      sortOrder: isSystemKey(normalized)
        ? SYSTEM_CHANNELS.find((c) => c.key === normalized)!.sortOrder
        : 500,
    },
    update: {
      ...(opts.label ? { label: opts.label } : {}),
    },
  });
}
