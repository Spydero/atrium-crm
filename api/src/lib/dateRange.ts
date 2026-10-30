export type DatePreset = "7d" | "14d" | "30d" | "90d" | "180d" | "365d" | "custom";

export type ResolvedRange = {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
  preset: DatePreset;
  label: string;
  days: number;
  granularity: "day" | "week";
};

function localKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

const PRESET_DAYS: Record<Exclude<DatePreset, "custom">, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

const PRESET_LABEL: Record<Exclude<DatePreset, "custom">, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "180d": "Last 6 months",
  "365d": "Last 12 months",
};

export function resolveDateRange(query: {
  range?: unknown;
  from?: unknown;
  to?: unknown;
}): ResolvedRange {
  const now = new Date();
  const today = startOfDay(now);
  const rawPreset = String(query.range || "7d");
  let preset: DatePreset =
    rawPreset === "14d" ||
    rawPreset === "30d" ||
    rawPreset === "90d" ||
    rawPreset === "180d" ||
    rawPreset === "365d" ||
    rawPreset === "custom" ||
    rawPreset === "7d"
      ? rawPreset
      : "7d";

  let from = startOfDay(today);
  let to = endOfDay(now);

  if (preset === "custom" || (query.from && query.to)) {
    const fromParsed = parseKey(String(query.from || ""));
    const toParsed = parseKey(String(query.to || ""));
    if (fromParsed && toParsed) {
      preset = "custom";
      from = startOfDay(fromParsed);
      to = endOfDay(toParsed);
      if (from > to) {
        const tmp = from;
        from = startOfDay(to);
        to = endOfDay(tmp);
      }
      // Cap at 400 days to keep charts readable
      const maxMs = 400 * 24 * 60 * 60 * 1000;
      if (to.getTime() - from.getTime() > maxMs) {
        from = startOfDay(new Date(to.getTime() - maxMs));
      }
    } else {
      preset = "7d";
      from = startOfDay(today);
      from.setDate(from.getDate() - 6);
      to = endOfDay(now);
    }
  } else {
    const days = PRESET_DAYS[preset];
    from = startOfDay(today);
    from.setDate(from.getDate() - (days - 1));
    to = endOfDay(now);
  }

  const days =
    Math.round((startOfDay(to).getTime() - from.getTime()) / 86400000) + 1;
  const granularity: "day" | "week" = days > 45 ? "week" : "day";
  // (the dashboard trend chart picks its own grouping, see trendBuckets.ts)

  const label =
    preset === "custom"
      ? `${localKey(from)} to ${localKey(to)}`
      : PRESET_LABEL[preset];

  return {
    from,
    to,
    fromKey: localKey(from),
    toKey: localKey(to),
    preset,
    label,
    days,
    granularity,
  };
}

export function buildChartBuckets(
  range: ResolvedRange,
  dates: Date[],
): { day: string; label: string; count: number; date: string }[] {
  const localKeyOf = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  if (range.granularity === "week") {
    const buckets: {
      day: string;
      label: string;
      count: number;
      date: string;
      start: Date;
      end: Date;
    }[] = [];
    const cursor = startOfDay(range.from);
    const last = startOfDay(range.to);
    while (cursor <= last) {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + 6);
      if (end > last) end.setTime(last.getTime());
      buckets.push({
        day: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        count: 0,
        date: localKeyOf(start),
        start,
        end: endOfDay(end),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    for (const d of dates) {
      const t = d.getTime();
      const row = buckets.find((b) => t >= b.start.getTime() && t <= b.end.getTime());
      if (row) row.count += 1;
    }
    return buckets.map(({ day, label, count, date }) => ({ day, label, count, date }));
  }

  const chart: { day: string; label: string; count: number; date: string }[] = [];
  const cursor = startOfDay(range.from);
  const last = startOfDay(range.to);
  while (cursor <= last) {
    const d = new Date(cursor);
    chart.push({
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      label:
        range.days <= 14
          ? d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: 0,
      date: localKeyOf(d),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const created of dates) {
    const key = localKeyOf(created);
    const row = chart.find((c) => c.date === key);
    if (row) row.count += 1;
  }
  return chart;
}

export { localKey, startOfDay, endOfDay };
