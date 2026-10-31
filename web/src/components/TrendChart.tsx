"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatAed, portalLabel, type OrgSettings } from "@/lib/api";
import { dateRangeQuery, defaultDateRange, type DateRangeValue } from "@/components/DateRangeFilter";

type Group = "day" | "week" | "month";
type Metric = string;

type Bucket = {
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

type Totals = {
  count: number;
  value: number;
  prevCount: number | null;
  prevValue: number | null;
  deltaPct: number | null;
  deltaAbs: number | null;
  avgPerBucket: number;
  activeBuckets: number;
  totalBuckets: number;
  peak: { title: string; label: string; count: number } | null;
};

type Trend = {
  metric: Metric;
  group: Group;
  allowedGroups: Group[];
  compare: boolean;
  range: { label: string; days: number; from: string; to: string };
  totals: Totals;
  buckets: Bucket[];
};

export type MetricMeta = { id: Metric; label: string; one: string; many: string; href: string; cta: string };

export type TrendConfig = {
  endpoint: string;
  metrics: MetricMeta[];
  /** Metric whose bucket value is money (shown as AED) */
  moneyMetric?: Metric;
  /** Metric that draws stacked outcome bars from bucket.breakdown */
  stackMetric?: Metric;
  breakdown: (metric: Metric) => { title: string; label: (key: string) => string };
};

const OUTCOME_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
  UNLOGGED: "Unlogged",
  UPCOMING: "Upcoming",
};

const VIEWING_STACK: { key: string; color: string }[] = [
  { key: "COMPLETED", color: "#15803d" },
  { key: "NO_SHOW", color: "#d97706" },
  { key: "CANCELLED", color: "#c45c26" },
  { key: "UNLOGGED", color: "#94a3b8" },
  { key: "UPCOMING", color: "#cbd5e1" },
];

export const DASHBOARD_TREND: TrendConfig = {
  endpoint: "/api/dashboard/trend",
  moneyMetric: "won",
  stackMetric: "viewings",
  metrics: [
    { id: "leads", label: "New leads", one: "new lead", many: "new leads", href: "/app/leads", cta: "Open leads" },
    { id: "viewings", label: "Viewings", one: "viewing", many: "viewings", href: "/app/calendar", cta: "Open calendar" },
    { id: "won", label: "Deals won", one: "deal won", many: "deals won", href: "/app/leads", cta: "Open leads" },
  ],
  breakdown: (m) =>
    m === "viewings"
      ? { title: "Outcome", label: (k) => OUTCOME_LABEL[k] || k }
      : { title: "Source", label: (k) => portalLabel(k) },
};

function withChannelLabels(
  cfg: TrendConfig,
  labels: Map<string, string>,
): TrendConfig {
  return {
    ...cfg,
    breakdown: (m) => {
      const base = cfg.breakdown(m);
      if (base.title !== "Source") return base;
      return {
        ...base,
        label: (k) => labels.get(k) || portalLabel(k),
      };
    },
  };
}

export const GUIDES_TREND: TrendConfig = {
  endpoint: "/api/guides/trend",
  metrics: [
    { id: "views", label: "Page views", one: "page view", many: "page views", href: "/app/leads", cta: "Open leads" },
    { id: "requests", label: "Requests", one: "request", many: "requests", href: "/app/leads", cta: "Open leads" },
    { id: "downloads", label: "Downloads", one: "download", many: "downloads", href: "/app/leads", cta: "Open leads" },
  ],
  breakdown: (m) =>
    m === "requests"
      ? { title: "Channel", label: (k) => k }
      : { title: "Guide", label: (k) => k },
};

const GROUPS: { id: Group; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

function pctOf(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: (id: T) => boolean;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-[8px] border border-line bg-paper p-0.5"
    >
      {options.map((o) => {
        const off = disabled?.(o.id) ?? false;
        return (
          <button
            key={o.id}
            type="button"
            disabled={off}
            aria-pressed={value === o.id}
            title={off ? "Not available for this date range" : undefined}
            onClick={() => onChange(o.id)}
            className={`rounded-[6px] px-2.5 py-1.5 text-xs font-bold transition ${
              value === o.id
                ? "bg-accent text-white"
                : off
                  ? "cursor-not-allowed text-muted/40"
                  : "text-muted hover:bg-[#eef1f4] hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Details({
  row,
  trend,
  noun,
  cfg,
}: {
  row: Bucket;
  trend: Trend;
  noun: { one: string; many: string };
  cfg: TrendConfig;
}) {
  const bd = cfg.breakdown(trend.metric);
  const total = trend.totals.count;
  const topBreak = row.breakdown.slice(0, 4);
  const maxBreak = Math.max(1, ...topBreak.map((b) => b.count));
  return (
    <div className="mt-2 rounded-[10px] border border-line bg-paper px-3.5 py-3 text-xs shadow-[0_8px_24px_rgba(16,20,24,0.08)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-bold text-ink">{row.title}</div>
        {row.isCurrent && (
          <span className="rounded bg-[#dff3ef] px-1.5 py-0.5 text-[10px] font-bold text-[#0d766c]">
            Now
          </span>
        )}
      </div>
      <div className="mt-1 text-muted">
        <span className="text-base font-bold text-accent">{row.count}</span>{" "}
        {row.count === 1 ? noun.one : noun.many}
        {cfg.moneyMetric === trend.metric && row.value > 0 && (
          <span className="ml-1.5 font-semibold text-ink">worth {formatAed(row.value)}</span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted">
        <dt>Share of period</dt>
        <dd className="text-right font-semibold text-ink">
          {pctOf(row.count, total)}% of {total}
        </dd>
        <dt>Running total</dt>
        <dd className="text-right font-semibold text-ink">{row.cumulative}</dd>
        {row.prev !== null && (
          <>
            <dt>Previous period</dt>
            <dd className="text-right font-semibold text-ink">
              {row.prev} ({signed(row.count - row.prev)})
            </dd>
          </>
        )}
      </dl>
      {topBreak.length > 0 && (
        <div className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
            {bd.title}
          </div>
          {topBreak.map((b) => (
            <div key={b.key}>
              <div className="flex justify-between">
                <span className="font-semibold text-ink">{bd.label(b.key)}</span>
                <span className="text-muted">
                  {b.count}
                  {row.count > 0 ? ` · ${pctOf(b.count, row.count)}%` : ""}
                </span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-[#eef1f4]">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${(b.count / maxBreak) * 100}%`,
                    background:
                      b.key === "COMPLETED"
                        ? "#15803d"
                        : b.key === "NO_SHOW"
                          ? "#d97706"
                          : b.key === "CANCELLED"
                            ? "#c45c26"
                            : undefined,
                  }}
                />
              </div>
            </div>
          ))}
          {(row.breakdown.find((b) => b.key === "UNLOGGED")?.count || 0) > 0 && (
            <div className="pt-0.5 text-muted">
              {row.breakdown.find((b) => b.key === "UNLOGGED")!.count} unlogged
            </div>
          )}
        </div>
      )}
      {row.count === 0 && <div className="mt-2 text-muted">Nothing recorded in this {trend.group}.</div>}
    </div>
  );
}

function Tip({
  active,
  payload,
  trend,
  noun,
  cfg,
}: {
  active?: boolean;
  payload?: { payload: Bucket }[];
  trend: Trend;
  noun: { one: string; many: string };
  cfg: TrendConfig;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="w-[230px]">
      <Details row={payload[0].payload} trend={trend} noun={noun} cfg={cfg} />
    </div>
  );
}

type Sort = "date" | "high" | "low";
const SORTS: { id: Sort; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "high", label: "Highest" },
  { id: "low", label: "Lowest" },
];

/** If the chosen grouping makes no sense for the current range, widen or narrow the range to fit it. */
function rangeFor(g: Group, days: number): DateRangeValue | null {
  if (g === "day" && days > 120) return defaultDateRange("30d");
  if (g === "week" && days < 14) return defaultDateRange("90d");
  if (g === "month" && days < 45) return defaultDateRange("365d");
  return null;
}

export function TrendChart({
  range,
  onRangeChange,
  config = DASHBOARD_TREND,
  extraQuery = "",
}: {
  range: DateRangeValue;
  onRangeChange: (next: DateRangeValue) => void;
  config?: TrendConfig;
  /** Extra query string (filters) sent with every request, e.g. "status=PUBLISHED" */
  extraQuery?: string;
}) {
  const [channelLabels, setChannelLabels] = useState<Map<string, string>>(() => new Map());
  const cfg = useMemo(
    () => withChannelLabels(config, channelLabels),
    [config, channelLabels],
  );
  const [metric, setMetric] = useState<Metric>(cfg.metrics[0].id);
  const [sort, setSort] = useState<Sort>("date");
  // A grouping you pick only applies to the date range it was picked on; a new range goes back to auto.
  const [choice, setChoice] = useState<{ rk: string; g: Group } | null>(null);
  const [compare, setCompare] = useState(false);
  /** Dashboard viewings only: hide cancelled band so totals match the KPI tile. */
  const [hideCancelled, setHideCancelled] = useState(true);
  // A pinned bar belongs to one view of the data; changing range, metric or grouping unpins it.
  const [pin, setPin] = useState<{ q: string; key: string } | null>(null);
  const [result, setResult] = useState<{ key: string; trend?: Trend; error?: string } | null>(null);
  const stackOn = cfg.stackMetric === metric;

  useEffect(() => {
    api<OrgSettings>("/api/settings")
      .then((s) => {
        const m = new Map<string, string>();
        for (const c of s.channels || []) m.set(c.key, c.label);
        setChannelLabels(m);
      })
      .catch(() => {});
  }, []);

  const rangeKey = dateRangeQuery(range);
  const group: Group | "auto" = choice && choice.rk === rangeKey ? choice.g : "auto";

  const query = useMemo(() => {
    const p = new URLSearchParams(rangeKey);
    new URLSearchParams(extraQuery).forEach((v, k) => p.set(k, v));
    p.set("metric", metric);
    if (group !== "auto") p.set("group", group);
    if (compare) p.set("compare", "1");
    return p.toString();
  }, [rangeKey, metric, group, compare, extraQuery]);

  useEffect(() => {
    let live = true;
    api<Trend>(`${cfg.endpoint}?${query}`)
      .then((trend) => live && setResult({ key: query, trend }))
      .catch((e) => live && setResult({ key: query, error: e instanceof Error ? e.message : "Failed to load" }));
    return () => {
      live = false;
    };
  }, [query]);

  const selected = pin && pin.q === query ? pin.key : null;
  const trend = result?.trend;
  const loading = !result || result.key !== query;
  const meta = cfg.metrics.find((m) => m.id === metric) ?? cfg.metrics[0];
  const unit = trend?.group ?? (group === "auto" ? "day" : group);

  const data = useMemo(() => {
    if (!trend) return [];
    const rows = trend.buckets.map((b) => {
      const parts: Record<string, number> = {};
      for (const s of VIEWING_STACK) parts[s.key] = 0;
      for (const x of b.breakdown) parts[x.key] = (parts[x.key] || 0) + x.count;
      const cancelled = parts.CANCELLED || 0;
      const displayCount =
        stackOn && hideCancelled ? Math.max(0, b.count - cancelled) : b.count;
      return {
        ...b,
        count: displayCount,
        rawCount: b.count,
        avg: trend.totals.avgPerBucket,
        ...parts,
        CANCELLED: stackOn && hideCancelled ? 0 : cancelled,
      };
    });
    if (sort === "date") return rows;
    return [...rows].sort(
      (a, b) => (sort === "high" ? b.count - a.count : a.count - b.count) || a.key.localeCompare(b.key),
    );
  }, [trend, sort, stackOn, hideCancelled]);

  const selectedRow = trend?.buckets.find((b) => b.key === selected) ?? null;
  const t = trend?.totals;
  const displayTotal =
    stackOn && hideCancelled && t
      ? data.reduce((s, b) => s + b.count, 0)
      : t?.count ?? null;
  const delta = t?.deltaAbs ?? null;

  return (
    <div className="surface p-5" data-testid="trend-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Seg
          label="Metric"
          value={metric}
          options={cfg.metrics.map((m) => ({ id: m.id, label: m.label }))}
          onChange={(m) => {
            setMetric(m);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Seg
            label="Group by"
            value={(trend?.group ?? (group === "auto" ? "day" : group)) as Group}
            options={GROUPS}
            onChange={(g) => {
              const days = trend?.range.days ?? 7;
              const next = rangeFor(g, days);
              if (next) {
                // the date range jumps to one that suits the grouping (shown in the range filter above)
                onRangeChange(next);
                setChoice({ rk: dateRangeQuery(next), g });
              } else {
                setChoice({ rk: rangeKey, g });
              }
            }}
          />
          <Seg label="Sort by" value={sort} options={SORTS} onChange={setSort} />
          <label className="flex cursor-pointer items-center gap-1.5 rounded-[8px] border border-line bg-paper px-2.5 py-1.5 text-xs font-bold text-muted hover:text-ink">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="accent-[#1a5f7a]"
            />
            Compare to previous
          </label>
          {stackOn && (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-[8px] border border-line bg-paper px-2.5 py-1.5 text-xs font-bold text-muted hover:text-ink">
              <input
                type="checkbox"
                checked={hideCancelled}
                onChange={(e) => setHideCancelled(e.target.checked)}
                className="accent-[#1a5f7a]"
                data-testid="hide-cancelled-trend"
              />
              Hide cancelled
            </label>
          )}
          <Link
            href={meta.href}
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
          >
            {meta.cta} <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          {meta.label} · {trend?.range.label ?? "..."} · by {unit}
          {sort !== "date" && ` · ${sort === "high" ? "highest" : "lowest"} first`}
        </div>
      </div>

      {result?.error && <p className="text-sm text-[var(--danger)]">{result.error}</p>}

      {t && (
        <div
          className={`mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-2 transition-opacity ${loading ? "opacity-50" : ""}`}
          data-testid="trend-summary"
        >
          <div className="font-display text-3xl font-bold tracking-[-0.03em]">
            {displayTotal ?? t.count}
            <span className="ml-1.5 text-sm font-semibold text-muted">
              {stackOn && hideCancelled
                ? (displayTotal ?? 0) === 1
                  ? "viewing held or due"
                  : "viewings held or due"
                : (displayTotal ?? t.count) === 1
                  ? meta.one
                  : meta.many}
            </span>
          </div>
          {cfg.moneyMetric === metric && (
            <div className="text-sm font-bold text-ink">{formatAed(t.value)}</div>
          )}
          {delta !== null && (
            <span
              data-testid="trend-delta"
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${
                delta > 0
                  ? "bg-[#e3f4e8] text-[#15803d]"
                  : delta < 0
                    ? "bg-[#fdeaea] text-[#b42318]"
                    : "bg-[#eef1f4] text-muted"
              }`}
            >
              {delta > 0 ? <TrendingUp size={13} /> : delta < 0 ? <TrendingDown size={13} /> : <Minus size={13} />}
              {t.deltaPct !== null ? `${signed(t.deltaPct)}%` : signed(delta)} vs previous {trend.range.days} days
              <span className="font-semibold opacity-70">(was {t.prevCount})</span>
            </span>
          )}
          <span className="text-sm font-semibold text-muted">
            avg {t.avgPerBucket}/{unit}
          </span>
          <span className="text-sm font-semibold text-muted">
            {t.activeBuckets} of {t.totalBuckets} {unit}s active
          </span>
          {t.peak && (
            <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">
              Peak {t.peak.label} · {t.peak.count}
            </span>
          )}
        </div>
      )}

      <div className={`h-[260px] transition-opacity ${loading ? "opacity-50" : ""}`} data-testid="trend-plot">
        {!trend && !result?.error && <div className="h-full animate-pulse rounded bg-line/40" />}
        {trend && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e8ecf0" vertical={false} strokeDasharray="3 6" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tick={{ fill: "#66707a", fontWeight: 600 }}
                dy={6}
                interval={data.length <= 14 ? 0 : "preserveStartEnd"}
                minTickGap={14}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={28}
                fontSize={11}
                tick={{ fill: "#66707a" }}
                domain={[0, (dataMax: number) => Math.max(3, Math.ceil(dataMax * 1.15))]}
              />
              <Tooltip
                cursor={{ fill: "rgba(26,95,122,0.07)" }}
                content={<Tip trend={trend} noun={meta} cfg={cfg} />}
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={{ zIndex: 20, outline: "none" }}
              />
              {stackOn ? (
                VIEWING_STACK.filter((s) => !(hideCancelled && s.key === "CANCELLED")).map((s, i, arr) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={OUTCOME_LABEL[s.key]}
                    stackId="viewings"
                    fill={s.color}
                    radius={i === arr.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={data.length > 40 ? 14 : 48}
                    animationDuration={400}
                    cursor="pointer"
                    onClick={(d: unknown) => {
                      const k =
                        (d as { key?: string; payload?: { key?: string } })?.payload?.key ??
                        (d as { key?: string })?.key;
                      if (k) setPin((cur) => (cur && cur.q === query && cur.key === k ? null : { q: query, key: k }));
                    }}
                  >
                    {i === arr.length - 1 && data.length <= 31 && (
                      <LabelList
                        dataKey="count"
                        position="top"
                        formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")}
                        style={{ fill: "#101418", fontSize: 11, fontWeight: 700 }}
                      />
                    )}
                  </Bar>
                ))
              ) : (
                <Bar
                  dataKey="count"
                  name={meta.label}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={data.length > 40 ? 14 : 48}
                  animationDuration={400}
                  cursor="pointer"
                  onClick={(d: unknown) => {
                    const k =
                      (d as { key?: string; payload?: { key?: string } })?.payload?.key ??
                      (d as { key?: string })?.key;
                    if (k) setPin((cur) => (cur && cur.q === query && cur.key === k ? null : { q: query, key: k }));
                  }}
                >
                  {data.map((row) => (
                    <Cell
                      key={row.key}
                      fill={row.isCurrent ? "#0d9488" : "#1a5f7a"}
                      fillOpacity={row.count === 0 ? 0.18 : selectedRow && selectedRow.key !== row.key ? 0.4 : 1}
                    />
                  ))}
                  {data.length <= 31 && (
                    <LabelList
                      dataKey="count"
                      position="top"
                      formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")}
                      style={{ fill: "#101418", fontSize: 11, fontWeight: 700 }}
                    />
                  )}
                </Bar>
              )}
              {trend.compare && sort === "date" && (
                <Line
                  type="linear"
                  dataKey="prev"
                  name="Previous period"
                  stroke="#7c8a97"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "#7c8a97", strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              <Line
                type="linear"
                dataKey="avg"
                name="Average"
                stroke="#c45c26"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-muted">
        {stackOn ? (
          VIEWING_STACK.filter((s) => !(hideCancelled && s.key === "CANCELLED")).map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {OUTCOME_LABEL[s.key]}
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" /> {meta.label} per {unit}
          </span>
        )}
        {!stackOn && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#0d9488" }} /> Current {unit}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-mark" /> Average per {unit}
        </span>
        {trend?.compare && sort === "date" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: "#7c8a97" }} /> Previous {trend.range.days} days
          </span>
        )}
        <span className="ml-auto font-normal">Hover for details, click a bar to pin it</span>
      </div>

      {trend && selectedRow && (
        <div data-testid="trend-pinned" className="max-w-[320px]">
          <Details row={selectedRow} trend={trend} noun={meta} cfg={cfg} />
        </div>
      )}
    </div>
  );
}
