/**
 * Pure helpers for duplicate detection and lead merging.
 * No database access here so the rules can be unit tested.
 */

export type StageName = "NEW" | "QUALIFIED" | "VIEWING" | "OFFER" | "WON" | "LOST";

export const STAGE_RANK: Record<StageName, number> = {
  LOST: -1,
  NEW: 0,
  QUALIFIED: 1,
  VIEWING: 2,
  OFFER: 3,
  WON: 4,
};

/**
 * Phone key = last 9 digits, so "+971 50 111 2233" and "050 111 2233" match.
 * Returns null for numbers too short to compare safely.
 */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-9);
}

export function emailKey(email: string | null | undefined): string | null {
  const e = (email || "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export type DupCandidate = {
  id: string;
  phone: string | null;
  email: string | null;
  stage: string;
  createdAt: Date | string;
  sourcesCount: number;
  notesCount: number;
};

export type DupReason = "phone" | "email";

export type DupGroup<T extends DupCandidate> = {
  leads: T[];
  reasons: DupReason[];
  suggestedPrimaryId: string;
};

function rank(stage: string) {
  return STAGE_RANK[stage as StageName] ?? 0;
}

/** Best lead to keep: furthest stage, then most history, then oldest. */
export function suggestPrimary<T extends DupCandidate>(leads: T[]): T {
  return [...leads].sort((a, b) => {
    const r = rank(b.stage) - rank(a.stage);
    if (r !== 0) return r;
    const h = b.sourcesCount + b.notesCount - (a.sourcesCount + a.notesCount);
    if (h !== 0) return h;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

/** Cluster leads that share a phone key or an email (transitively). */
export function groupDuplicates<T extends DupCandidate>(leads: T[]): DupGroup<T>[] {
  const parent = leads.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const byPhone = new Map<string, number[]>();
  const byEmail = new Map<string, number[]>();
  leads.forEach((l, i) => {
    const p = phoneKey(l.phone);
    const e = emailKey(l.email);
    if (p) byPhone.set(p, [...(byPhone.get(p) || []), i]);
    if (e) byEmail.set(e, [...(byEmail.get(e) || []), i]);
  });
  for (const idxs of [...byPhone.values(), ...byEmail.values()]) {
    for (let k = 1; k < idxs.length; k++) union(idxs[0], idxs[k]);
  }

  const clusters = new Map<number, number[]>();
  leads.forEach((_, i) => {
    const r = find(i);
    clusters.set(r, [...(clusters.get(r) || []), i]);
  });

  const groups: DupGroup<T>[] = [];
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue;
    const members = idxs.map((i) => leads[i]);
    const set = new Set(idxs);
    const reasons: DupReason[] = [];
    if ([...byPhone.values()].some((v) => v.filter((i) => set.has(i)).length > 1)) reasons.push("phone");
    if ([...byEmail.values()].some((v) => v.filter((i) => set.has(i)).length > 1)) reasons.push("email");
    groups.push({
      leads: members,
      reasons,
      suggestedPrimaryId: suggestPrimary(members).id,
    });
  }
  // Largest groups first, then most recently created member
  return groups.sort((a, b) => {
    if (b.leads.length !== a.leads.length) return b.leads.length - a.leads.length;
    const newest = (g: DupGroup<T>) =>
      Math.max(...g.leads.map((l) => new Date(l.createdAt).getTime()));
    return newest(b) - newest(a);
  });
}

export type Mergeable = {
  name: string;
  phone: string | null;
  email: string | null;
  listingId: string | null;
  assignedToId: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  bedsWanted: number | null;
  dealValueAed: number | null;
  communities: string[];
  notesSummary: string | null;
  createdAt: Date;
  firstRespondedAt: Date | null;
};

export type MergeResult = {
  phone: string | null;
  email: string | null;
  listingId: string | null;
  assignedToId: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  bedsWanted: number | null;
  dealValueAed: number | null;
  communities: string[];
  notesSummary: string | null;
  createdAt: Date;
  firstRespondedAt: Date | null;
};

function present<T>(v: T | null | undefined): v is T {
  return v != null && (v as unknown) !== "";
}

function firstNonNull<T>(primary: T | null, others: (T | null)[]): T | null {
  if (present(primary)) return primary;
  for (const o of others) if (present(o)) return o;
  return null;
}

/**
 * The kept (primary) lead wins every conflict. Blank fields are filled from the
 * duplicates in the order given. Communities are unioned. createdAt and
 * firstRespondedAt take the earliest value so history is not lost.
 */
export function mergeLeadFields(primary: Mergeable, dups: Mergeable[]): MergeResult {
  const communities = [...new Set([...primary.communities, ...dups.flatMap((d) => d.communities)])];
  const created = [primary.createdAt, ...dups.map((d) => d.createdAt)];
  const responded = [primary.firstRespondedAt, ...dups.map((d) => d.firstRespondedAt)].filter(
    (d): d is Date => d != null,
  );
  return {
    phone: firstNonNull(primary.phone, dups.map((d) => d.phone)),
    email: firstNonNull(primary.email, dups.map((d) => d.email)),
    listingId: firstNonNull(primary.listingId, dups.map((d) => d.listingId)),
    assignedToId: firstNonNull(primary.assignedToId, dups.map((d) => d.assignedToId)),
    budgetMin: firstNonNull(primary.budgetMin, dups.map((d) => d.budgetMin)),
    budgetMax: firstNonNull(primary.budgetMax, dups.map((d) => d.budgetMax)),
    bedsWanted: firstNonNull(primary.bedsWanted, dups.map((d) => d.bedsWanted)),
    dealValueAed: firstNonNull(primary.dealValueAed, dups.map((d) => d.dealValueAed)),
    communities,
    notesSummary: firstNonNull(primary.notesSummary, dups.map((d) => d.notesSummary)),
    createdAt: new Date(Math.min(...created.map((d) => d.getTime()))),
    firstRespondedAt: responded.length
      ? new Date(Math.min(...responded.map((d) => d.getTime())))
      : null,
  };
}

/** Text of the note kept on the surviving lead so merged contact details are never lost. */
export function mergedFromNote(
  primary: Pick<Mergeable, "phone" | "email">,
  dup: Pick<Mergeable, "name" | "phone" | "email">,
) {
  const parts = [`Merged from duplicate lead "${dup.name}"`];
  const extra: string[] = [];
  if (dup.phone && dup.phone !== primary.phone) extra.push(`phone ${dup.phone}`);
  if (dup.email && dup.email.toLowerCase() !== (primary.email || "").toLowerCase()) {
    extra.push(`email ${dup.email}`);
  }
  if (extra.length) parts.push(`Other contact details: ${extra.join(", ")}`);
  return `${parts.join(". ")}.`;
}
