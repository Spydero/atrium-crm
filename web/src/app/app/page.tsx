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
import { api, formatAed, portalLabel } from "@/lib/api";
import { TrendChart } from "@/components/TrendChart";
import { ViewingHealthCard } from "@/components/ViewingHealth";
import {
  DateRangeFilter,
  dateRangeQuery,
  defaultDateRange,
  type DateRangeValue,
} from "@/components/DateRangeFilter";

type StageRow = { stage: string; count: number; valueAed: number };
type SourceRow = { source: string; label?: string; count: number };
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
  newLeadsWeek: number;
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
          ? `${kpis.viewingsWeek} viewings in range · excl. cancelled`
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

      <TrendChart range={dateRange} onRangeChange={setDateRange} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ViewingHealthCard range={dateRange} />
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

        <div className="surface p-5 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                Leads by source
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                Unique leads in this range · all-touch
              </p>
            </div>
            <Link
              href={`/app/money?${dateRangeQuery(dateRange)}`}
              className="shrink-0 text-xs font-semibold text-accent hover:underline"
              title="Source ROI with team-entered spend"
            >
              View source ROI
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
                      {row.label || portalLabel(row.source)}
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
              {kpis.viewingsWeek} in the current window (excl. cancelled) · log outcomes after each one
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
