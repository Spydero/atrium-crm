"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Building2,
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  Handshake,
  Wallet,
  Eye,
  ChevronRight,
} from "lucide-react";
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
import { api, formatAed, portalLabel } from "@/lib/api";
import {
  DateRangeFilter,
  dateRangeQuery,
  defaultDateRange,
  type DateRangeValue,
} from "@/components/DateRangeFilter";

type StageRow = { stage: string; count: number; valueAed: number };
type SourceRow = { source: string; count: number };
type ChartPoint = { day: string; label: string; count: number; date: string };
type Viewing = {
  id: string;
  title: string;
  startsAt: string;
  leadName: string | null;
  leadId: string | null;
  listingTitle: string | null;
  community: string | null;
};
type AttentionItem = {
  id: string;
  label: string;
  detail: string;
  valueAed: number;
  startsAt: string;
};

type Kpis = {
  openLeads: number;
  pipelineAed: number;
  viewingsWeek: number;
  closeRate: number;
  winRateOpen: number;
  won: number;
  lost: number;
  listingsActive: number;
  listingsDraft: number;
  newLeadsChart: ChartPoint[];
  newLeadsWeek: number;
  peakDay: { label: string; count: number } | null;
  range?: {
    preset: string;
    from: string;
    to: string;
    label: string;
    days: number;
    granularity: "day" | "week";
  };
  pipelineByStage: StageRow[];
  sourceMix: SourceRow[];
  upcomingViewings: Viewing[];
  attention: {
    overdueViewings: number;
    atRiskAed: number;
    draftListings: number;
    items: AttentionItem[];
  };
};

const STAGE_COLORS: Record<string, string> = {
  NEW: "#94a3b8",
  QUALIFIED: "#1a5f7a",
  VIEWING: "#0d9488",
  OFFER: "#c45c26",
  WON: "#15803d",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ChartTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: ChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-[8px] border border-line bg-paper px-3 py-2 text-xs shadow-[0_8px_24px_rgba(16,20,24,0.1)]">
      <div className="font-bold text-ink">{row.label}</div>
      <div className="mt-0.5 text-muted">
        <span className="font-bold text-accent">{payload[0].value}</span> new lead
        {payload[0].value === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [hoverSource, setHoverSource] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => defaultDateRange("7d"));

  async function loadKpis(range: DateRangeValue = dateRange) {
    setRefreshing(true);
    try {
      const data = await api<Kpis>(`/api/dashboard/kpis?${dateRangeQuery(range)}`);
      setKpis(data);
      setError("");
    } catch (e) {
      if (e instanceof Error && /session expired|unauthorized/i.test(e.message)) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadKpis(dateRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.preset, dateRange.from, dateRange.to]);

  const maxSource = useMemo(
    () => Math.max(1, ...(kpis?.sourceMix.map((s) => s.count) || [1])),
    [kpis],
  );

  const stageMax = useMemo(
    () => Math.max(1, ...(kpis?.pipelineByStage.map((s) => s.count) || [1])),
    [kpis],
  );

  const chartAvg = useMemo(() => {
    if (!kpis?.newLeadsChart.length) return 0;
    const sum = kpis.newLeadsChart.reduce((s, d) => s + d.count, 0);
    return Math.round((sum / kpis.newLeadsChart.length) * 10) / 10;
  }, [kpis]);

  const todayKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const chartData = useMemo(() => {
    if (!kpis) return [];
    return kpis.newLeadsChart.map((row) => ({
      ...row,
      avg: chartAvg,
      isToday: row.date === todayKey,
    }));
  }, [kpis, chartAvg, todayKey]);

  if (error) {
    return <p className="text-[var(--danger)]">{error}</p>;
  }

  if (!kpis) {
    return (
      <div className="animate-rise space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-line/60" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="surface h-28 animate-pulse bg-paper/70" />
          ))}
        </div>
      </div>
    );
  }

  const kpisCards = [
    {
      label: "Open leads",
      value: String(kpis.openLeads),
      hint: `${kpis.newLeadsWeek} new in range`,
      href: "/app/leads",
      icon: Users,
      accent: false,
    },
    {
      label: "Pipeline",
      value: formatAed(kpis.pipelineAed),
      hint: `${kpis.won} won · ${kpis.lost} lost`,
      href: "/app/leads",
      icon: Wallet,
      accent: false,
    },
    {
      label: "Close rate",
      value: `${kpis.closeRate}%`,
      hint: `${kpis.winRateOpen}% of open+won`,
      href: "/app/money",
      icon: TrendingUp,
      accent: true,
    },
    {
      label: "Active listings",
      value: String(kpis.listingsActive),
      hint:
        kpis.viewingsWeek > 0
          ? `${kpis.viewingsWeek} viewings in range`
          : kpis.listingsDraft > 0
            ? `${kpis.listingsDraft} still draft`
            : "Inventory live",
      href: "/app/listings",
      icon: Building2,
      accent: false,
    },
  ];

  return (
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{greeting()}</p>
          <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">
            Desk overview
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Pipeline health, viewings, and what needs a reply today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => loadKpis(dateRange)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <Link href="/app/leads" className="btn-ghost text-sm">
            Open leads
          </Link>
          <Link href="/app/listings" className="btn-primary text-sm">
            Add listing
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpisCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="group surface relative overflow-hidden p-4 transition duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_12px_28px_rgba(16,20,24,0.07)]"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  {card.label}
                </div>
                <span
                  className={`rounded-[8px] p-1.5 ${
                    card.accent
                      ? "bg-accent-soft text-accent"
                      : "bg-[#eef1f4] text-muted"
                  }`}
                >
                  <Icon size={15} strokeWidth={1.85} />
                </span>
              </div>
              <div
                className={`font-display mt-3 text-[1.85rem] font-bold tracking-[-0.04em] ${
                  card.accent ? "text-accent" : "text-ink"
                }`}
              >
                {card.value}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">{card.hint}</span>
                <ArrowUpRight
                  size={14}
                  className="text-muted opacity-0 transition group-hover:opacity-100"
                />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <div className="surface p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                New leads · {kpis.range?.label || "selected range"}
                {kpis.range?.granularity === "week" ? " (weekly)" : ""}
              </div>
              <div className="font-display mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xl font-bold tracking-[-0.03em]">
                <span>
                  {kpis.newLeadsWeek}
                  <span className="ml-1.5 text-sm font-semibold text-muted">captured</span>
                </span>
                <span className="text-sm font-semibold text-muted">
                  avg {chartAvg}/{kpis.range?.granularity === "week" ? "week" : "day"}
                </span>
                {kpis.peakDay && kpis.peakDay.count > 0 && (
                  <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">
                    Peak {kpis.peakDay.label} · {kpis.peakDay.count}
                  </span>
                )}
              </div>
            </div>
            <Link
              href="/app/leads"
              className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
            >
              Pipeline <ChevronRight size={14} />
            </Link>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e8ecf0" vertical={false} strokeDasharray="3 6" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tick={{ fill: "#66707a", fontWeight: 600 }}
                  dy={6}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  fontSize={11}
                  tick={{ fill: "#66707a" }}
                  domain={[0, (dataMax: number) => Math.max(3, dataMax + 1)]}
                />
                <Tooltip
                  cursor={{ fill: "rgba(26,95,122,0.06)" }}
                  content={<ChartTip />}
                />
                <Bar
                  dataKey="count"
                  name="New leads"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                  animationDuration={500}
                >
                  {chartData.map((row) => (
                    <Cell
                      key={row.date}
                      fill={row.isToday ? "#0d9488" : "#1a5f7a"}
                      fillOpacity={row.count === 0 ? 0.18 : 1}
                    />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="top"
                    formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")}
                    style={{ fill: "#101418", fontSize: 11, fontWeight: 700 }}
                  />
                </Bar>
                <Line
                  type="monotone"
                  dataKey="avg"
                  name="Daily avg"
                  stroke="#c45c26"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" /> Daily volume
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: "#0d9488" }}
              />{" "}
              Today
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-mark" />{" "}
              Period average
            </span>
          </div>
        </div>

        <div className="surface p-5">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Pipeline by stage
          </div>
          <p className="mb-4 text-xs text-muted">Click a stage to focus · open full board on Leads</p>
          <div className="space-y-2.5">
            {kpis.pipelineByStage.map((row) => {
              const on = activeStage === row.stage;
              const width = Math.max(8, (row.count / stageMax) * 100);
              return (
                <button
                  key={row.stage}
                  type="button"
                  onClick={() => setActiveStage(on ? null : row.stage)}
                  className={`w-full rounded-[8px] border px-3 py-2.5 text-left transition ${
                    on
                      ? "border-accent bg-accent-soft/50"
                      : "border-transparent bg-[#f4f6f8] hover:border-line"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tracking-wide">{row.stage}</span>
                    <span className="text-xs text-muted">
                      {row.count} · {formatAed(row.valueAed)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${width}%`,
                        background: STAGE_COLORS[row.stage] || "#1a5f7a",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          <Link
            href="/app/leads"
            className="btn-ghost mt-4 flex w-full items-center justify-center gap-1 text-sm"
          >
            Open kanban <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="surface p-5 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              Lead sources
            </div>
            <Link href="/app/money" className="text-xs font-semibold text-accent hover:underline">
              Money Map
            </Link>
          </div>
          <div className="space-y-3">
            {kpis.sourceMix.map((row) => {
              const on = hoverSource === row.source;
              return (
                <div
                  key={row.source}
                  onMouseEnter={() => setHoverSource(row.source)}
                  onMouseLeave={() => setHoverSource(null)}
                  className="cursor-default"
                >
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className={`font-semibold ${on ? "text-accent" : ""}`}>
                      {portalLabel(row.source)}
                    </span>
                    <span className="text-muted">{row.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#eef1f4]">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{
                        width: `${(row.count / maxSource) * 100}%`,
                        opacity: on || !hoverSource ? 1 : 0.35,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {!kpis.sourceMix.length && (
              <p className="text-sm text-muted">No source data yet.</p>
            )}
          </div>
        </div>

        <div className="surface p-5 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye size={15} className="text-accent" />
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                Upcoming viewings
              </div>
            </div>
            <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">
              {kpis.viewingsWeek} this week
            </span>
          </div>
          <div className="space-y-2">
            {kpis.upcomingViewings.map((v) => (
              <Link
                key={v.id}
                href="/app/calendar"
                className="block rounded-[8px] border border-line px-3 py-2.5 transition hover:border-accent/40 hover:bg-accent-soft/30"
              >
                <div className="text-sm font-bold">
                  {v.leadName || v.title}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {v.listingTitle || "Listing TBD"}
                  {v.community ? ` · ${v.community}` : ""}
                </div>
                <div className="mt-1 text-[11px] font-semibold text-accent">
                  {formatWhen(v.startsAt)}
                </div>
              </Link>
            ))}
            {!kpis.upcomingViewings.length && (
              <div className="rounded-[8px] bg-[#f4f6f8] px-3 py-4 text-sm text-muted">
                No viewings scheduled ahead.{" "}
                <Link href="/app/calendar" className="font-semibold text-accent">
                  Open calendar
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="surface overflow-hidden p-5 lg:col-span-1">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                <AlertTriangle size={14} className="text-mark" />
                Needs attention
              </div>
              <p className="mt-1 text-xs text-muted">
                Overdue viewings put deal value at risk
              </p>
            </div>
          </div>
          <div className="mb-4 rounded-[10px] bg-mark-soft px-3 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-mark">
              At-risk value
            </div>
            <div className="font-display mt-1 text-2xl font-bold tracking-[-0.03em] text-mark">
              {formatAed(kpis.attention.atRiskAed)}
            </div>
            <div className="mt-1 text-xs text-mark/80">
              {kpis.attention.overdueViewings} overdue · {kpis.attention.draftListings} drafts
            </div>
          </div>
          <div className="space-y-2">
            {kpis.attention.items.slice(0, 3).map((item) => (
              <Link
                key={item.id}
                href="/app/calendar"
                className="flex items-center justify-between gap-2 rounded-[8px] border border-line px-3 py-2 text-left transition hover:border-mark/40"
              >
                <div>
                  <div className="text-sm font-bold">{item.label}</div>
                  <div className="text-xs text-muted">{item.detail}</div>
                </div>
                <div className="text-right text-xs font-bold text-mark">
                  {formatAed(item.valueAed)}
                </div>
              </Link>
            ))}
            {!kpis.attention.items.length && (
              <div className="flex items-center gap-2 rounded-[8px] bg-[#eef8f0] px-3 py-3 text-sm text-[#15803d]">
                <Handshake size={16} />
                Nothing overdue - desk is clear.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
            <CalendarDays size={18} />
          </div>
          <div>
            <div className="text-sm font-bold">Viewings on the calendar</div>
            <div className="text-xs text-muted">
              {kpis.viewingsWeek} in the current window · keep feedback after each one
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/app/calendar" className="btn-ghost text-sm">
            Calendar
          </Link>
          <Link href="/app/shortlists" className="btn-primary text-sm">
            Share shortlist
          </Link>
        </div>
      </div>
    </div>
  );
}
