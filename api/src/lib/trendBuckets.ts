import { endOfDay, localKey, startOfDay, type ResolvedRange } from "./dateRange.js";

export type TrendGroup = "day" | "week" | "month";
export type TrendMetric = "leads" | "viewings" | "won";

export type TrendItem = {
  at: Date;
  /** Breakdown bucket (source or outcome) for the tooltip. */
  key?: string;
  /** Money value (AED) to add up, if any. */
  value?: number;
  /** How many events this item stands for (daily totals use this). Default 1. */
  n?: number;
};

export const totalOf = (items: TrendItem[]) => items.reduce((s, i) => s + (i.n ?? 1), 0);

export type TrendBucket = {
  key: string;
  label: string;
  title: string;
  start: string;
  end: string;
  count: number;
  value: number;
  prev: number | null;
  cumulative: number;
  isCurrent: boolean;
  breakdown: { key: string; count: number }[];
};

const MAX_DAY_BARS = 120;

/** Which groupings make sense for a range length. */
export function allowedGroups(days: number): TrendGroup[] {
  const out: TrendGroup[] = [];
  if (days <= MAX_DAY_BARS) out.push("day");
  if (days >= 14) out.push("week");
  if (days >= 45) out.push("month");
  if (!out.length) out.push("day");
  return out;
}

export function autoGroup(days: number): TrendGroup {
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  return "month";
}

export function pickGroup(requested: unknown, days: number): TrendGroup {
  const allowed = allowedGroups(days);
  if (requested === "day" || requested === "week" || requested === "month") {
    if (allowed.includes(requested)) return requested;
  }
  const auto = autoGroup(days);
  return allowed.includes(auto) ? auto : allowed[0];
}

type Span = { start: Date; end: Date };

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Split [from, to] into day, week (7 day blocks from the start) or calendar month spans. */
export function makeSpans(from: Date, to: Date, group: TrendGroup): Span[] {
  const spans: Span[] = [];
  const first = startOfDay(from);
  const last = startOfDay(to);
  let cursor = new Date(first);
  while (cursor <= last) {
    let end: Date;
    if (group === "day") {
      end = new Date(cursor);
    } else if (group === "week") {
      end = addDays(cursor, 6);
    } else {
      end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    }
    if (end > last) end = new Date(last);
    spans.push({ start: new Date(cursor), end: startOfDay(end) });
    cursor = addDays(end, 1);
  }
  return spans;
}

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", o);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "25 Oct" (day first, matches the rest of the app). */
const dm = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;

function labelFor(span: Span, group: TrendGroup, days: number, crossesYears: boolean) {
  if (group === "day") {
    return days <= 14
      ? `${fmt(span.start, { weekday: "short" })} ${span.start.getDate()}`
      : dm(span.start);
  }
  if (group === "week") return dm(span.start);
  return crossesYears
    ? `${MON[span.start.getMonth()]} '${String(span.start.getFullYear()).slice(-2)}`
    : fmt(span.start, { month: "short" });
}

function titleFor(span: Span, group: TrendGroup) {
  if (group === "day") {
    return fmt(span.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (group === "week") {
    const sameDay = localKey(span.start) === localKey(span.end);
    if (sameDay) return `${fmt(span.start, { weekday: "short" })} ${dm(span.start)}`;
    return `${dm(span.start)} to ${dm(span.end)}`;
  }
  const partial =
    span.start.getDate() !== 1 ||
    span.end.getDate() !== new Date(span.end.getFullYear(), span.end.getMonth() + 1, 0).getDate();
  const name = fmt(span.start, { month: "long", year: "numeric" });
  return partial
    ? `${name} (${span.start.getDate()} to ${dm(span.end)})`
    : name;
}

function fill(spans: Span[], items: TrendItem[]) {
  const rows = spans.map((s) => ({
    s,
    from: s.start.getTime(),
    to: endOfDay(s.end).getTime(),
    count: 0,
    value: 0,
    by: new Map<string, number>(),
  }));
  for (const it of items) {
    const t = it.at.getTime();
    const row = rows.find((r) => t >= r.from && t <= r.to);
    if (!row) continue;
    const n = it.n ?? 1;
    row.count += n;
    row.value += it.value ?? 0;
    if (it.key) row.by.set(it.key, (row.by.get(it.key) ?? 0) + n);
  }
  return rows;
}

export function buildTrend(
  range: ResolvedRange,
  group: TrendGroup,
  items: TrendItem[],
  prevItems: TrendItem[] | null,
  now = new Date(),
): TrendBucket[] {
  const spans = makeSpans(range.from, range.to, group);
  const rows = fill(spans, items);

  let prevCounts: number[] | null = null;
  if (prevItems) {
    const shiftMs = startOfDay(range.to).getTime() - startOfDay(range.from).getTime();
    const prevTo = addDays(range.from, -1);
    const prevFrom = new Date(startOfDay(prevTo).getTime() - shiftMs);
    prevCounts = fill(makeSpans(prevFrom, prevTo, group), prevItems).map((r) => r.count);
  }

  const crossesYears = range.from.getFullYear() !== range.to.getFullYear();
  const todayMs = now.getTime();
  let running = 0;
  return rows.map((r, i) => {
    running += r.count;
    return {
      key: localKey(r.s.start),
      label: labelFor(r.s, group, range.days, crossesYears),
      title: titleFor(r.s, group),
      start: localKey(r.s.start),
      end: localKey(r.s.end),
      count: r.count,
      value: r.value,
      prev: prevCounts ? (prevCounts[i] ?? null) : null,
      cumulative: running,
      isCurrent: todayMs >= r.from && todayMs <= r.to,
      breakdown: [...r.by.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    };
  });
}

export function summarize(buckets: TrendBucket[], prevTotal: number | null, prevValue: number | null) {
  const count = buckets.reduce((s, b) => s + b.count, 0);
  const value = buckets.reduce((s, b) => s + b.value, 0);
  const peak = buckets.reduce<TrendBucket | null>(
    (best, b) => (b.count > 0 && (!best || b.count > best.count) ? b : best),
    null,
  );
  const active = buckets.filter((b) => b.count > 0).length;
  const deltaPct =
    prevTotal === null ? null : prevTotal === 0 ? (count === 0 ? 0 : null) : Math.round(((count - prevTotal) / prevTotal) * 100);
  return {
    count,
    value,
    prevCount: prevTotal,
    prevValue,
    deltaPct,
    deltaAbs: prevTotal === null ? null : count - prevTotal,
    avgPerBucket: buckets.length ? Math.round((count / buckets.length) * 10) / 10 : 0,
    activeBuckets: active,
    totalBuckets: buckets.length,
    peak: peak ? { title: peak.title, label: peak.label, count: peak.count } : null,
  };
}
