"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Eye,
  Pencil,
  Trophy,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatAed, pct, portalLabel } from "@/lib/api";
import {
  DateRangeFilter,
  dateRangeQuery,
  defaultDateRange,
  type DateRangeValue,
} from "@/components/DateRangeFilter";
import { SourceSpendEditor } from "@/components/SourceSpendEditor";

type Delta = { abs: number; pct: number | null; direction: "better" | "worse" | "flat" } | null;

type Metrics = {
  spend: number | null;
  spendStatus: "entered" | "zero" | "none";
  spendPartial: boolean;
  leads: number;
  viewings: number;
  wins: number;
  sharedWins: number;
  wonValue: number;
  costPerViewing: number | null;
  costPerWin: number | null;
  leadToViewingPct: number | null;
  viewingToWinPct: number | null;
};

type Row = Metrics & {
  source: string;
  label?: string;
  atRisk: { value: number; leads: number; items: number };
  prev: Metrics;
  delta: Record<string, Delta>;
  cue: { kind: string; reason: string };
};

type MoneyMap = {
  range: { preset: string; label: string; from: string; to: string; days: number };
  previous: { from: string; to: string; label: string };
  currency: { code: string; label: string };
  attribution: string;
  totals: Metrics & { prev: Metrics; delta: Record<string, Delta> };
  rows: Row[];
  benchmarks: {
    medianCostPerViewing: number | null;
    medianCostPerWin: number | null;
    eligibleSources: number;
  };
  callouts: {
    best: { source: string; metric: string; value: number } | null;
    worst: { source: string; metric: string; value: number } | null;
    reallocation: { from: string; to: string; amount: number; extraViewings: number } | null;
    missingSpend: string[];
  };
  channels?: { key: string; label: string; kind: string; enabled: boolean }[];
  atRisk: {
    value: number;
    items: number;
    leads: number;
    unvaluedLeads: number;
    list: {
      leadId: string;
      leadName: string;
      stage: string;
      dealValue: number | null;
      sources: string[];
      overdueItems: number;
      oldest: {
        eventId: string;
        title: string;
        type: string;
        startsAt: string;
        daysOverdue: number;
      };
    }[];
  };
};

type SortKey =
  | "spend"
  | "leads"
  | "viewings"
  | "wins"
  | "wonValue"
  | "costPerViewing"
  | "costPerWin"
  | "leadToViewingPct"
  | "viewingToWinPct"
  | "source"
  | "atRisk";

type ChartMetric = "costPerViewing" | "costPerWin" | "viewings";

const CUE_STYLE: Record<string, string> = {
  SCALE: "bg-[#dcfce7] text-[#166534]",
  CUT: "bg-[#fee2e2] text-[#991b1b]",
  REVIEW: "bg-[#ffedd5] text-[#9a3412]",
  ADD_SPEND: "bg-[#e0f2fe] text-[#075985]",
  ORGANIC: "bg-[#eef1f4] text-muted",
  TOO_EARLY: "bg-[#eef1f4] text-muted",
  HOLD: "bg-[#eef1f4] text-muted",
};

const CUE_BAR: Record<string, string> = {
  SCALE: "#15803d",
  CUT: "#b42318",
  REVIEW: "#c2410c",
  ADD_SPEND: "#94a3b8",
  ORGANIC: "#94a3b8",
  TOO_EARLY: "#94a3b8",
  HOLD: "#1a5f7a",
};

function DeltaPill({ d, invertLabel }: { d: Delta; invertLabel?: boolean }) {
  if (!d) return null;
  const good = d.direction === "better";
  const bad = d.direction === "worse";
  const tone = good ? "text-[#15803d]" : bad ? "text-[#b42318]" : "text-muted";
  const Icon = good ? TrendingUp : bad ? TrendingDown : ArrowUpRight;
  const text =
    d.pct == null
      ? d.abs === 0
        ? "no change"
        : `${d.abs > 0 ? "+" : ""}${d.abs}`
      : Math.abs(d.pct) > 999
        ? d.pct > 0
          ? "over +999%"
          : "over -999%"
        : `${d.pct > 0 ? "+" : ""}${d.pct}%`;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${tone}`} data-testid="delta">
      {d.direction !== "flat" && <Icon size={11} />}
      {text}
      {invertLabel ? null : null}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  delta,
  danger,
  onClick,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  note: string;
  delta?: Delta;
  danger?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`surface px-4 py-3.5 text-left ${danger ? "border-[var(--mark)]/25 bg-[var(--mark-soft)]" : ""} ${
        onClick ? "cursor-pointer hover:border-accent/40" : ""
      }`}
      data-testid={`stat-${label}`}
    >
      <div
        className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] ${
          danger ? "text-[var(--mark)]" : "text-muted"
        }`}
      >
        <Icon size={13} /> {label}
      </div>
      <div
        className={`font-display mt-1.5 text-[1.65rem] font-bold leading-none tracking-[-0.03em] ${
          danger ? "text-[var(--mark)]" : ""
        }`}
      >
        {value}
      </div>
      <div className={`mt-1 text-xs ${danger ? "text-[var(--mark)]/80" : "text-muted"}`}>{note}</div>
      {delta && (
        <div className="mt-1.5">
          <DeltaPill d={delta} />
          <span className="ml-1 text-[11px] text-muted">vs previous</span>
        </div>
      )}
    </Comp>
  );
}

function moneyQuery(range: DateRangeValue) {
  return `/api/money/map?${dateRangeQuery(range)}`;
}

function rangeFromSearch(sp: URLSearchParams | null): DateRangeValue {
  const preset = sp?.get("range");
  const allowed = ["7d", "14d", "30d", "90d", "180d", "365d"] as const;
  if (preset && (allowed as readonly string[]).includes(preset)) {
    return defaultDateRange(preset as (typeof allowed)[number]);
  }
  if (preset === "custom" && sp?.get("from") && sp?.get("to")) {
    return { preset: "custom", from: sp.get("from")!, to: sp.get("to")! };
  }
  return defaultDateRange("90d");
}

export default function MoneyPage() {
  const search = useSearchParams();
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => rangeFromSearch(search));
  const [data, setData] = useState<MoneyMap | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("spend");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("costPerViewing");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);
  const [spendFocus, setSpendFocus] = useState<string | null>(null);
  const [showAllRisk, setShowAllRisk] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setDateRange(rangeFromSearch(search));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.get("range"), search.get("from"), search.get("to")]);

  useEffect(() => {
    setError("");
    api<MoneyMap>(moneyQuery(dateRange))
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [dateRange, tick]);

  const channelLabelOf = (key: string) => {
    if (!data) return portalLabel(key);
    const fromRow = data.rows.find((r) => r.source === key)?.label;
    if (fromRow) return fromRow;
    const fromCat = data.channels?.find((c) => c.key === key)?.label;
    return fromCat || portalLabel(key);
  };

  const activeRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;
    if (!showAll) {
      rows = rows.filter(
        (r) =>
          r.leads > 0 ||
          r.viewings > 0 ||
          r.wins > 0 ||
          (r.spend != null && r.spend > 0) ||
          r.atRisk.leads > 0,
      );
    }
    const mul = dir === "asc" ? 1 : -1;
    const val = (r: Row): number | string | null => {
      switch (sort) {
        case "source":
          return r.label || channelLabelOf(r.source);
        case "atRisk":
          return r.atRisk.value;
        case "spend":
          return r.spend;
        default:
          return r[sort] as number | null;
      }
    };
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return mul * av.localeCompare(bv);
      return mul * ((av as number) - (bv as number));
    });
  }, [data, showAll, sort, dir]);

  const chartRows = useMemo(() => {
    return activeRows
      .filter((r) => {
        if (chartMetric === "viewings") return r.viewings > 0;
        return r[chartMetric] != null;
      })
      .map((r) => ({
        source: r.source,
        label: r.label || channelLabelOf(r.source),
        value: chartMetric === "viewings" ? r.viewings : (r[chartMetric] as number),
        cue: r.cue.kind,
        noSpend: r.spendStatus === "none",
      }))
      .sort((a, b) =>
        chartMetric === "viewings" ? b.value - a.value : a.value - b.value,
      );
  }, [activeRows, chartMetric]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "source" || key === "costPerViewing" || key === "costPerWin" ? "asc" : "desc");
    }
  }

  if (error) return <p className="text-[var(--mark)]">{error}</p>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const t = data.totals;
  const riskList = showAllRisk ? data.atRisk.list : data.atRisk.list.slice(0, 10);
  const median = data.benchmarks.medianCostPerViewing;

  return (
    <div className="animate-rise space-y-4" data-testid="money-map">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">Money Map</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Which sources turn entered spend into viewings and wins. All-touch credit - one lead can count on more than one source.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => {
              setSpendFocus(null);
              setSpendOpen(true);
            }}
          >
            <Pencil size={14} /> Edit spend
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Banknote}
          label="Entered spend"
          value={t.spend != null ? formatAed(t.spend) : "-"}
          note={data.range.label}
          delta={t.delta.spend}
        />
        <StatCard
          icon={Eye}
          label="Viewings"
          value={String(t.viewings)}
          note="completed in range"
          delta={t.delta.viewings}
        />
        <StatCard
          icon={Trophy}
          label="Wins"
          value={String(t.wins)}
          note={formatAed(t.wonValue) + " won value"}
          delta={t.delta.wins}
        />
        <StatCard
          icon={ArrowDownRight}
          label="Cost / viewing"
          value={t.costPerViewing != null ? formatAed(t.costPerViewing) : "-"}
          note={median != null ? `median ${formatAed(median)}` : "need 2+ sources"}
          delta={t.delta.costPerViewing}
        />
        <StatCard
          icon={ArrowDownRight}
          label="Cost / win"
          value={t.costPerWin != null ? formatAed(t.costPerWin) : "-"}
          note="entered spend / wins"
          delta={t.delta.costPerWin}
        />
        <StatCard
          icon={AlertTriangle}
          label="At risk"
          value={formatAed(data.atRisk.value)}
          note={`${data.atRisk.leads} leads · right now`}
          danger
          onClick={() => document.getElementById("at-risk")?.scrollIntoView({ behavior: "smooth" })}
        />
      </div>

      {(data.callouts.best ||
        data.callouts.worst ||
        data.callouts.reallocation ||
        data.callouts.missingSpend.length > 0) && (
        <div className="flex flex-wrap gap-2" data-testid="callouts">
          {data.callouts.best && (
            <span className="rounded-full bg-[#dcfce7] px-3 py-1.5 text-xs font-bold text-[#166534]">
              Best: {channelLabelOf(data.callouts.best.source)} · cost / viewing{" "}
              {formatAed(data.callouts.best.value)}
            </span>
          )}
          {data.callouts.worst && (
            <span className="rounded-full bg-[#fee2e2] px-3 py-1.5 text-xs font-bold text-[#991b1b]">
              Worst: {channelLabelOf(data.callouts.worst.source)} · cost / viewing{" "}
              {formatAed(data.callouts.worst.value)}
            </span>
          )}
          {data.callouts.reallocation && (
            <span className="rounded-full bg-[#ffedd5] px-3 py-1.5 text-xs font-bold text-[#9a3412]">
              Rough estimate: move {formatAed(data.callouts.reallocation.amount)} / mo from{" "}
              {channelLabelOf(data.callouts.reallocation.from)} to{" "}
              {channelLabelOf(data.callouts.reallocation.to)} for ~{data.callouts.reallocation.extraViewings}{" "}
              more viewings
            </span>
          )}
          {data.callouts.missingSpend.length > 0 && (
            <button
              type="button"
              className="rounded-full bg-[#e0f2fe] px-3 py-1.5 text-xs font-bold text-[#075985]"
              onClick={() => {
                setSpendFocus(data.callouts.missingSpend[0]);
                setSpendOpen(true);
              }}
            >
              {data.callouts.missingSpend.length} sources with leads have no spend entered - ROI is incomplete.
              Enter spend
            </button>
          )}
        </div>
      )}

      <div className="surface p-4" data-testid="money-chart">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Source comparison</div>
            <p className="text-sm text-muted">Sorted best first. Dashed line is the median among eligible sources.</p>
          </div>
          <div className="flex rounded-[8px] border border-line bg-paper p-0.5">
            {(
              [
                ["costPerViewing", "Cost / viewing"],
                ["costPerWin", "Cost / win"],
                ["viewings", "Viewings"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`rounded-[6px] px-2.5 py-1 text-xs font-bold ${
                  chartMetric === id ? "bg-accent text-white" : "text-muted hover:text-ink"
                }`}
                onClick={() => setChartMetric(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {chartRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Not enough data in this range for a chart.</p>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartRows}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  tick={{ fontSize: 11, fill: "#334155" }}
                />
                <Tooltip
                  formatter={(v) =>
                    chartMetric === "viewings" ? String(v) : formatAed(Number(v))
                  }
                  contentStyle={{ borderRadius: 10, borderColor: "#e5e7eb", fontSize: 12 }}
                />
                {chartMetric !== "viewings" && median != null && chartMetric === "costPerViewing" && (
                  <ReferenceLine
                    x={median}
                    stroke="#c2410c"
                    strokeDasharray="4 4"
                    label={{ value: "median", position: "insideTopRight", fontSize: 10, fill: "#c2410c" }}
                  />
                )}
                <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer">
                  {chartRows.map((r) => (
                    <Cell
                      key={r.source}
                      fill={r.noSpend ? "#94a3b8" : CUE_BAR[r.cue] || "#1a5f7a"}
                      opacity={highlight && highlight !== r.source ? 0.35 : 1}
                      onClick={() => {
                        setHighlight(r.source);
                        document.getElementById(`row-${r.source}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="surface overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">By source</div>
            <p className="text-xs text-muted">
              Entered spend - typed by your team. Rows can add up to more than the total because one lead can credit several sources.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[#1a5f7a]"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Show all sources
          </label>
        </div>
        <table className="w-full min-w-[980px] text-left text-sm" data-testid="money-table">
          <thead className="border-b border-line bg-[#f3f5f7] text-[11px] uppercase tracking-[0.08em] text-muted">
            <tr>
              {(
                [
                  ["source", "Source"],
                  ["spend", "Entered spend"],
                  ["leads", "Leads"],
                  ["viewings", "Viewings"],
                  ["leadToViewingPct", "Lead to viewing"],
                  ["wins", "Wins"],
                  ["viewingToWinPct", "Viewing to win"],
                  ["wonValue", "Won value"],
                  ["costPerViewing", "Cost / viewing"],
                  ["costPerWin", "Cost / win"],
                  ["atRisk", "At risk"],
                ] as const
              ).map(([key, label]) => (
                <th key={key} className="px-3 py-3 font-bold">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggleSort(key)}>
                    {label}
                    {sort === key && <span>{dir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeRows.map((r) => (
              <tr
                key={r.source}
                id={`row-${r.source}`}
                className={`border-b border-line/70 ${highlight === r.source ? "bg-accent-soft/50" : ""}`}
              >
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{r.label || channelLabelOf(r.source)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${CUE_STYLE[r.cue.kind] || CUE_STYLE.HOLD}`}
                      title={r.cue.reason}
                    >
                      {r.cue.kind.replace("_", " ")}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium hover:text-accent"
                    onClick={() => {
                      setSpendFocus(r.source);
                      setSpendOpen(true);
                    }}
                  >
                    {r.spend == null ? (
                      <span className="text-muted">Not entered</span>
                    ) : (
                      formatAed(r.spend)
                    )}
                    <Pencil size={12} className="text-muted" />
                  </button>
                  {r.spendPartial && <div className="text-[10px] text-muted">Partial range</div>}
                </td>
                <td className="px-3 py-3">
                  <Link className="font-semibold text-accent hover:underline" href={`/app/leads?source=${r.source}`}>
                    {r.leads}
                  </Link>
                </td>
                <td className="px-3 py-3">{r.viewings}</td>
                <td className="px-3 py-3">{r.leadToViewingPct != null ? pct(r.leadToViewingPct) : "-"}</td>
                <td className="px-3 py-3">
                  <Link
                    className="font-semibold text-accent hover:underline"
                    href={`/app/leads?source=${r.source}&stage=WON`}
                  >
                    {r.wins}
                  </Link>
                  {r.sharedWins > 0 && (
                    <div className="text-[10px] text-muted" title="Also credited to another source">
                      {r.sharedWins} shared
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">{r.viewingToWinPct != null ? pct(r.viewingToWinPct) : "-"}</td>
                <td className="px-3 py-3">{formatAed(r.wonValue)}</td>
                <td className="px-3 py-3">
                  <div>{r.costPerViewing != null ? formatAed(r.costPerViewing) : "-"}</div>
                  <DeltaPill d={r.delta.costPerViewing} />
                </td>
                <td className="px-3 py-3">
                  <div>{r.costPerWin != null ? formatAed(r.costPerWin) : "-"}</div>
                  <DeltaPill d={r.delta.costPerWin} />
                </td>
                <td className="px-3 py-3">
                  {r.atRisk.leads > 0 ? (
                    <span className="font-semibold text-[var(--mark)]">{formatAed(r.atRisk.value)}</span>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {!activeRows.length && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted">
                  No activity in this range. Enter spend to see ROI, or widen the dates.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="surface p-4" id="at-risk" data-testid="at-risk">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--mark)]">At risk now</div>
            <p className="text-sm text-muted">
              {formatAed(data.atRisk.value)} across {data.atRisk.leads} leads with overdue follow-ups or viewings
              {data.atRisk.unvaluedLeads > 0
                ? ` · +${data.atRisk.unvaluedLeads} with no deal value`
                : ""}
            </p>
          </div>
          {data.atRisk.list.length > 10 && (
            <button type="button" className="btn-ghost text-sm" onClick={() => setShowAllRisk((v) => !v)}>
              {showAllRisk ? "Show top 10" : `Show all ${data.atRisk.list.length}`}
            </button>
          )}
        </div>
        {!riskList.length && <p className="text-sm text-muted">None overdue. Nice.</p>}
        <ul className="divide-y divide-line">
          {riskList.map((l) => (
            <li key={l.leadId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-semibold">{l.leadName}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {l.overdueItems} overdue · {l.oldest.title} · {l.oldest.daysOverdue}d late ·{" "}
                  {l.sources.map(channelLabelOf).join(", ")}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-[var(--mark)]">{formatAed(l.dealValue || 0)}</span>
                <Link className="text-sm font-semibold text-accent hover:underline" href={`/app/leads?lead=${l.leadId}`}>
                  Open lead
                </Link>
                <Link
                  className="text-sm font-semibold text-accent hover:underline"
                  href={`/app/calendar?date=${l.oldest.startsAt.slice(0, 10)}`}
                >
                  Open calendar
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <details className="surface px-4 py-3 text-sm text-muted">
        <summary className="cursor-pointer font-semibold text-ink">How we count</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Entered spend is typed in by your team. It is not pulled from Google or Meta yet.</li>
          <li>All-touch: a viewing or win credits every source the lead had before that outcome.</li>
          <li>Lead to viewing and viewing to win use the cohort of leads that arrived in this range.</li>
          <li>At risk is right now: overdue items on open leads, counted once per lead.</li>
          <li>Cost cards treat lower as better. Scale / Cut / Review badges use cost per viewing vs the median.</li>
        </ul>
      </details>

      <SourceSpendEditor
        open={spendOpen}
        onClose={() => setSpendOpen(false)}
        focusSource={spendFocus}
        onSaved={() => setTick((n) => n + 1)}
      />
    </div>
  );
}
