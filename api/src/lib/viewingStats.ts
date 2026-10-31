import type { CancelReason, LeadSource, ViewingOutcome } from "@prisma/client";
import { prisma } from "./prisma.js";
import { previousRange, type ResolvedRange } from "./dateRange.js";
import { allowedGroups, makeSpans, pickGroup, type TrendGroup } from "./trendBuckets.js";
import { cancelReasonLabel } from "./eventOutcome.js";

/** Lag metrics only count outcomes logged after calendar V1.5 shipped. */
export const OUTCOME_TRACKING_SINCE = new Date("2026-10-31T10:57:16.000Z");

export type CancelParty =
  | "Client"
  | "Our side"
  | "Owner or listing"
  | "Rescheduled"
  | "Other"
  | "Not recorded";

export type ViewingTotals = {
  booked: number;
  completed: number;
  noShow: number;
  cancelled: number;
  unlogged: number;
  upcoming: number;
  decided: number;
  duplicates: number;
};

export type ViewingRates = {
  held: number | null;
  cancel: number | null;
  noShow: number | null;
  show: number | null;
  loggingCoverage: number | null;
  lateCancel: number | null;
};

export type RawViewing = {
  id: string;
  startsAt: Date;
  outcome: ViewingOutcome;
  cancelReason: CancelReason | null;
  outcomeAt: Date | null;
  notes: string | null;
  listingId: string | null;
  createdById: string | null;
  listing: { id: string; title: string } | null;
  createdBy: { id: string; name: string } | null;
  lead: {
    id: string;
    name: string;
    primarySource: LeadSource;
    assignedToId: string | null;
    assignedTo: { id: string; name: string } | null;
  } | null;
};

export function partyOf(reason: CancelReason | null): CancelParty {
  if (!reason) return "Not recorded";
  if (reason === "CLIENT") return "Client";
  if (reason === "AGENT") return "Our side";
  if (reason === "LANDLORD" || reason === "LISTING_UNAVAILABLE") return "Owner or listing";
  if (reason === "RESCHEDULED") return "Rescheduled";
  return "Other";
}

function reasonKey(reason: CancelReason | null): string {
  return reason ?? "NOT_RECORDED";
}

export function reasonLabelOf(reason: CancelReason | null): string {
  return reason ? cancelReasonLabel(reason) : "Not recorded";
}

function rate(num: number, den: number): number | null {
  if (den < 5) return null;
  return Math.round((num / den) * 1000) / 1000;
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function ppDelta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null) return null;
  return Math.round((cur - prev) * 1000) / 10;
}

export function noticeBucket(hours: number): string {
  if (hours < 0) return "After start";
  if (hours < 2) return "< 2h";
  if (hours < 24) return "2-24h";
  if (hours < 72) return "1-3 days";
  return "> 3 days";
}

export function classify(v: { startsAt: Date; outcome: ViewingOutcome; cancelReason: CancelReason | null }, now: Date) {
  if (v.outcome === "CANCELLED" && v.cancelReason === "DUPLICATE") return "dup" as const;
  if (v.outcome === "COMPLETED") return "completed" as const;
  if (v.outcome === "NO_SHOW") return "noShow" as const;
  if (v.outcome === "CANCELLED") return "cancelled" as const;
  if (v.startsAt.getTime() < now.getTime()) return "unlogged" as const;
  return "upcoming" as const;
}

export function totalsOf(
  rows: { startsAt: Date; outcome: ViewingOutcome; cancelReason: CancelReason | null }[],
  now: Date,
): ViewingTotals {
  let completed = 0;
  let noShow = 0;
  let cancelled = 0;
  let unlogged = 0;
  let upcoming = 0;
  let duplicates = 0;
  for (const v of rows) {
    const k = classify(v, now);
    if (k === "dup") duplicates += 1;
    else if (k === "completed") completed += 1;
    else if (k === "noShow") noShow += 1;
    else if (k === "cancelled") cancelled += 1;
    else if (k === "unlogged") unlogged += 1;
    else upcoming += 1;
  }
  const decided = completed + noShow + cancelled;
  const booked = decided + unlogged + upcoming;
  return { booked, completed, noShow, cancelled, unlogged, upcoming, decided, duplicates };
}

function ratesOf(t: ViewingTotals, lateCancel: number | null): ViewingRates {
  const d = t.decided;
  return {
    held: rate(t.completed, d),
    cancel: rate(t.cancelled, d),
    noShow: rate(t.noShow, d),
    show: rate(t.completed, t.completed + t.noShow),
    loggingCoverage: rate(d, d + t.unlogged),
    lateCancel,
  };
}

async function loadViewings(organizationId: string, from: Date, to: Date): Promise<RawViewing[]> {
  return prisma.calendarEvent.findMany({
    where: {
      organizationId,
      type: "VIEWING",
      startsAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      startsAt: true,
      outcome: true,
      cancelReason: true,
      outcomeAt: true,
      notes: true,
      listingId: true,
      createdById: true,
      listing: { select: { id: true, title: true } },
      createdBy: { select: { id: true, name: true } },
      lead: {
        select: {
          id: true,
          name: true,
          primarySource: true,
          assignedToId: true,
          assignedTo: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export function computeLag(rows: Pick<RawViewing, "startsAt" | "outcome" | "cancelReason" | "outcomeAt">[]) {
  const noticeHours: number[] = [];
  const noticeBucketMap = new Map<string, number>();
  let lateCancels = 0;
  let lateSample = 0;
  for (const v of rows) {
    if (v.outcome !== "CANCELLED" || v.cancelReason === "DUPLICATE") continue;
    if (!v.outcomeAt || v.outcomeAt < OUTCOME_TRACKING_SINCE) continue;
    const h = (v.startsAt.getTime() - v.outcomeAt.getTime()) / 3_600_000;
    noticeHours.push(h);
    lateSample += 1;
    if (h < 24) lateCancels += 1;
    const b = noticeBucket(h);
    noticeBucketMap.set(b, (noticeBucketMap.get(b) || 0) + 1);
  }
  const order = ["After start", "< 2h", "2-24h", "1-3 days", "> 3 days"];
  const loggingHours: number[] = [];
  let within24 = 0;
  for (const v of rows) {
    if (v.outcome !== "COMPLETED" && v.outcome !== "NO_SHOW") continue;
    if (!v.outcomeAt || v.outcomeAt < OUTCOME_TRACKING_SINCE) continue;
    const h = (v.outcomeAt.getTime() - v.startsAt.getTime()) / 3_600_000;
    loggingHours.push(h);
    if (h <= 24) within24 += 1;
  }
  return {
    notice: {
      sampleSize: noticeHours.length,
      since: OUTCOME_TRACKING_SINCE.toISOString(),
      medianHours: median(noticeHours),
      buckets: order.map((key) => ({ key, count: noticeBucketMap.get(key) || 0 })),
    },
    logging: {
      sampleSize: loggingHours.length,
      medianHours: median(loggingHours),
      within24hShare: loggingHours.length ? within24 / loggingHours.length : null,
    },
    lateCancelRate: rate(lateCancels, lateSample),
  };
}

function reasonsOf(rows: Pick<RawViewing, "outcome" | "cancelReason">[]) {
  const map = new Map<string, { reason: string; party: CancelParty; count: number }>();
  let cancelled = 0;
  for (const v of rows) {
    if (v.outcome !== "CANCELLED" || v.cancelReason === "DUPLICATE") continue;
    cancelled += 1;
    const key = reasonKey(v.cancelReason);
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else map.set(key, { reason: key, party: partyOf(v.cancelReason), count: 1 });
  }
  const reasons = [...map.values()]
    .map((r) => ({
      reason: r.reason,
      label: reasonLabelOf(r.reason === "NOT_RECORDED" ? null : (r.reason as CancelReason)),
      party: r.party,
      count: r.count,
      share: cancelled ? r.count / cancelled : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const partyMap = new Map<CancelParty, number>();
  for (const r of reasons) partyMap.set(r.party, (partyMap.get(r.party) || 0) + r.count);
  const parties = [...partyMap.entries()]
    .map(([party, count]) => ({ party, count, share: cancelled ? count / cancelled : 0 }))
    .sort((a, b) => b.count - a.count);
  return { reasons, parties };
}

type BreakRow = {
  key: string;
  label: string;
  booked: number;
  completed: number;
  noShow: number;
  cancelled: number;
  unlogged: number;
  held: number | null;
  cancel: number | null;
  noShowRate: number | null;
  topCancelReason: string | null;
};

function breakdown(rows: RawViewing[], now: Date, kind: "agent" | "listing" | "source"): BreakRow[] {
  type Acc = {
    label: string;
    completed: number;
    noShow: number;
    cancelled: number;
    unlogged: number;
    upcoming: number;
    reasons: Map<string, number>;
  };
  const map = new Map<string, Acc>();
  for (const v of rows) {
    const bucket = classify(v, now);
    if (bucket === "dup") continue;
    let key = "none";
    let label = "Unassigned";
    if (kind === "agent") {
      const agent = v.lead?.assignedTo || v.createdBy;
      key = agent?.id || "unassigned";
      label = agent?.name || "Unassigned";
    } else if (kind === "listing") {
      key = v.listingId || "none";
      label = v.listing?.title || "No listing";
    } else {
      key = v.lead?.primarySource || "NONE";
      label = v.lead?.primarySource || "No lead";
    }
    let acc = map.get(key);
    if (!acc) {
      acc = {
        label,
        completed: 0,
        noShow: 0,
        cancelled: 0,
        unlogged: 0,
        upcoming: 0,
        reasons: new Map(),
      };
      map.set(key, acc);
    }
    if (bucket === "completed") acc.completed += 1;
    else if (bucket === "noShow") acc.noShow += 1;
    else if (bucket === "cancelled") {
      acc.cancelled += 1;
      const rk = reasonKey(v.cancelReason);
      acc.reasons.set(rk, (acc.reasons.get(rk) || 0) + 1);
    } else if (bucket === "unlogged") acc.unlogged += 1;
    else acc.upcoming += 1;
  }

  const rowsOut: BreakRow[] = [...map.entries()].map(([key, a]) => {
    const booked = a.completed + a.noShow + a.cancelled + a.unlogged + a.upcoming;
    const decided = a.completed + a.noShow + a.cancelled;
    let top: string | null = null;
    let topN = 0;
    for (const [rk, n] of a.reasons) {
      if (n > topN) {
        topN = n;
        top = reasonLabelOf(rk === "NOT_RECORDED" ? null : (rk as CancelReason));
      }
    }
    return {
      key,
      label: a.label,
      booked,
      completed: a.completed,
      noShow: a.noShow,
      cancelled: a.cancelled,
      unlogged: a.unlogged,
      held: rate(a.completed, decided),
      cancel: rate(a.cancelled, decided),
      noShowRate: rate(a.noShow, decided),
      topCancelReason: top,
    };
  });
  rowsOut.sort((a, b) => b.booked - a.booked || a.label.localeCompare(b.label));
  if (rowsOut.length <= 10) return rowsOut;
  const head = rowsOut.slice(0, 10);
  const rest = rowsOut.slice(10);
  const other: BreakRow = {
    key: "other",
    label: "Other",
    booked: 0,
    completed: 0,
    noShow: 0,
    cancelled: 0,
    unlogged: 0,
    held: null,
    cancel: null,
    noShowRate: null,
    topCancelReason: null,
  };
  for (const r of rest) {
    other.booked += r.booked;
    other.completed += r.completed;
    other.noShow += r.noShow;
    other.cancelled += r.cancelled;
    other.unlogged += r.unlogged;
  }
  const decided = other.completed + other.noShow + other.cancelled;
  other.held = rate(other.completed, decided);
  other.cancel = rate(other.cancelled, decided);
  other.noShowRate = rate(other.noShow, decided);
  return [...head, other];
}

function seriesOf(rows: RawViewing[], range: ResolvedRange, group: TrendGroup, now: Date) {
  const spans = makeSpans(range.from, range.to, group);
  return spans.map((span) => {
    const inSpan = rows.filter((v) => v.startsAt >= span.start && v.startsAt <= span.end);
    const t = totalsOf(inSpan, now);
    const decided = t.decided;
    return {
      key: localKeySafe(span.start),
      label: labelSpan(span.start, group),
      title: `${localKeySafe(span.start)} to ${localKeySafe(span.end)}`,
      start: span.start.toISOString(),
      end: span.end.toISOString(),
      booked: t.booked,
      completed: t.completed,
      noShow: t.noShow,
      cancelled: t.cancelled,
      unlogged: t.unlogged,
      upcoming: t.upcoming,
      held: rate(t.completed, decided),
      cancel: rate(t.cancelled, decided),
      noShowRate: rate(t.noShow, decided),
    };
  });
}

function localKeySafe(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function labelSpan(d: Date, group: TrendGroup) {
  if (group === "month") {
    return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function localDateTime(d: Date) {
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

/** Map raw viewings into trend items with UPCOMING/UNLOGGED split; drop duplicates. */
export function viewingTrendItems(
  rows: { startsAt: Date; outcome: ViewingOutcome; cancelReason?: CancelReason | null }[],
  now: Date,
) {
  const out: { at: Date; key: string }[] = [];
  for (const r of rows) {
    if (r.outcome === "CANCELLED" && r.cancelReason === "DUPLICATE") continue;
    if (r.outcome === "SCHEDULED") {
      out.push({
        at: r.startsAt,
        key: r.startsAt.getTime() < now.getTime() ? "UNLOGGED" : "UPCOMING",
      });
    } else {
      out.push({ at: r.startsAt, key: r.outcome });
    }
  }
  return out;
}

export function aggregateViewingHealth(
  curRows: RawViewing[],
  range: ResolvedRange,
  opts: {
    now?: Date;
    compare?: boolean;
    group?: TrendGroup;
    detail?: "full" | "headline";
    prevRows?: RawViewing[];
  } = {},
) {
  const now = opts.now ?? new Date();
  const compare = opts.compare !== false;
  const group = opts.group ?? pickGroup(undefined, range.days);
  const detail = opts.detail ?? "full";
  const prevRows = opts.prevRows ?? [];

  const lag = computeLag(curRows);
  const totals = totalsOf(curRows, now);
  const rates = ratesOf(totals, lag.lateCancelRate);
  const prevTotals = totalsOf(prevRows, now);
  const prevLag = computeLag(prevRows);
  const prevRates = ratesOf(prevTotals, prevLag.lateCancelRate);
  const { reasons, parties } = reasonsOf(curRows);

  const headline = {
    range: {
      preset: range.preset,
      label: range.label,
      from: range.fromKey,
      to: range.toKey,
      days: range.days,
    },
    group,
    allowedGroups: allowedGroups(range.days),
    now: now.toISOString(),
    totals,
    rates,
    previous: compare ? { totals: prevTotals, rates: prevRates } : null,
    deltasPp: compare
      ? {
          held: ppDelta(rates.held, prevRates.held),
          cancel: ppDelta(rates.cancel, prevRates.cancel),
          noShow: ppDelta(rates.noShow, prevRates.noShow),
          show: ppDelta(rates.show, prevRates.show),
        }
      : null,
  };

  if (detail === "headline") return headline;

  const recentCancellations = curRows
    .filter((v) => v.outcome === "CANCELLED" && v.cancelReason !== "DUPLICATE")
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, 25)
    .map((v) => {
      const noticeHours =
        v.outcomeAt && v.outcomeAt >= OUTCOME_TRACKING_SINCE
          ? (v.startsAt.getTime() - v.outcomeAt.getTime()) / 3_600_000
          : null;
      return {
        id: v.id,
        startsAt: v.startsAt.toISOString(),
        outcomeAt: v.outcomeAt?.toISOString() ?? null,
        leadName: v.lead?.name ?? null,
        listingTitle: v.listing?.title ?? null,
        agentName: v.lead?.assignedTo?.name || v.createdBy?.name || null,
        reason: reasonKey(v.cancelReason),
        reasonLabel: reasonLabelOf(v.cancelReason),
        noticeHours,
        notes: v.notes,
      };
    });

  return {
    ...headline,
    reasons,
    parties,
    notice: lag.notice,
    logging: lag.logging,
    series: seriesOf(curRows, range, group, now),
    breakdowns: {
      agent: breakdown(curRows, now, "agent"),
      listing: breakdown(curRows, now, "listing"),
      source: breakdown(curRows, now, "source"),
    },
    recentCancellations,
  };
}

export type ViewingHealth = Awaited<ReturnType<typeof computeViewingHealth>>;

export async function computeViewingHealth(
  organizationId: string,
  range: ResolvedRange,
  opts: { now?: Date; compare?: boolean; group?: unknown; detail?: "full" | "headline" } = {},
) {
  const compare = opts.compare !== false;
  const group = pickGroup(opts.group, range.days);
  const prev = previousRange(range);
  const [curRows, prevRows] = await Promise.all([
    loadViewings(organizationId, range.from, range.to),
    compare ? loadViewings(organizationId, prev.from, prev.to) : Promise.resolve([] as RawViewing[]),
  ]);
  return aggregateViewingHealth(curRows, range, {
    now: opts.now,
    compare,
    group,
    detail: opts.detail,
    prevRows,
  });
}

export const VIEWINGS_CSV_HEADERS = [
  "Date",
  "Time",
  "Lead",
  "Listing",
  "Agent",
  "Source",
  "Outcome",
  "Cancel reason",
  "Cancelled by",
  "Notice (hours)",
  "Logged at",
  "Logging delay (hours)",
  "Notes",
] as const;

export function viewingCsvRows(
  rows: RawViewing[],
  opts: { cancelledOnly?: boolean } = {},
): (string | number | null)[][] {
  const filtered = opts.cancelledOnly
    ? rows.filter((v) => v.outcome === "CANCELLED")
    : rows;
  const sorted = [...filtered].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return sorted.map((v) => {
    const { date, time } = localDateTime(v.startsAt);
    const agent = v.lead?.assignedTo?.name || v.createdBy?.name || "";
    const usableLag = v.outcomeAt && v.outcomeAt >= OUTCOME_TRACKING_SINCE;
    let notice: number | null = null;
    let logDelay: number | null = null;
    let loggedAt: string | null = null;
    if (v.outcomeAt) {
      const lt = localDateTime(v.outcomeAt);
      loggedAt = `${lt.date} ${lt.time}`;
    }
    if (usableLag && v.outcomeAt) {
      if (v.outcome === "CANCELLED") {
        notice = Math.round(((v.startsAt.getTime() - v.outcomeAt.getTime()) / 3_600_000) * 10) / 10;
      }
      if (v.outcome === "COMPLETED" || v.outcome === "NO_SHOW") {
        logDelay = Math.round(((v.outcomeAt.getTime() - v.startsAt.getTime()) / 3_600_000) * 10) / 10;
      }
    }
    const outcome =
      v.outcome === "NO_SHOW"
        ? "No-show"
        : v.outcome === "SCHEDULED"
          ? "Scheduled"
          : v.outcome === "COMPLETED"
            ? "Completed"
            : "Cancelled";
    return [
      date,
      time,
      v.lead?.name ?? "",
      v.listing?.title ?? "",
      agent,
      v.lead?.primarySource ?? "",
      outcome,
      v.outcome === "CANCELLED" ? reasonLabelOf(v.cancelReason) : "",
      v.outcome === "CANCELLED" ? partyOf(v.cancelReason) : "",
      notice,
      loggedAt,
      logDelay,
      v.notes ?? "",
    ];
  });
}

export async function loadViewingsForCsv(
  organizationId: string,
  from: Date,
  to: Date,
): Promise<RawViewing[]> {
  return loadViewings(organizationId, from, to);
}
