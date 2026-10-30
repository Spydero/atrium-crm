"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, portalLabel } from "@/lib/api";
import {
  DateRangeFilter,
  dateRangeQuery,
  defaultDateRange,
  type DateRangeValue,
} from "@/components/DateRangeFilter";

type Summary = {
  range?: {
    preset: string;
    from: string;
    to: string;
    label: string;
    days: number;
  };
  leadsByStage: { stage: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  winsBySource: { source: string; count: number }[];
  viewingOutcomes: { outcome: string; count: number }[];
  listingsByStatus: { status: string; count: number }[];
  portalsByStatus: { portal: string; status: string; count: number }[];
  agentLeaderboard: { agentId: string | null; name: string; leads: number }[];
};

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[8px] border border-line bg-paper px-3 py-2 text-xs shadow-[0_8px_24px_rgba(16,20,24,0.1)]">
      <div className="font-bold text-ink">{label}</div>
      <div className="mt-0.5 text-muted">{payload[0].value}</div>
    </div>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => defaultDateRange("30d"));

  async function load(range: DateRangeValue = dateRange) {
    setRefreshing(true);
    try {
      const summary = await api<Summary>(
        `/api/reports/summary?${dateRangeQuery(range)}`,
      );
      setData(summary);
      setError("");
    } catch (e) {
      if (e instanceof Error && /session expired|unauthorized/i.test(e.message)) return;
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(dateRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.preset, dateRange.from, dateRange.to]);

  if (error) return <p className="text-[var(--danger)]">{error}</p>;
  if (!data) {
    return (
      <div className="animate-rise space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-line/60" />
        <div className="grid gap-3 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="surface h-56 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const livePortals = data.portalsByStatus
    .filter((p) => p.status === "LIVE")
    .map((p) => ({
      portal: portalLabel(p.portal),
      count: p.count,
    }));

  return (
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            Insights
          </div>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-[-0.03em]">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted">
            Activity in {data.range?.label || "selected range"}. Inventory lists stay as a
            live snapshot.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => load(dateRange)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Leads by stage
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.leadsByStage}>
                <CartesianGrid stroke="#e8ecf0" vertical={false} strokeDasharray="3 6" />
                <XAxis dataKey="stage" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={11} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(26,95,122,0.06)" }} />
                <Bar dataKey="count" fill="#1a5f7a" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Leads by source
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.leadsBySource.map((r) => ({
                  ...r,
                  label: portalLabel(r.source),
                }))}
              >
                <CartesianGrid stroke="#e8ecf0" vertical={false} strokeDasharray="3 6" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={11} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(26,95,122,0.06)" }} />
                <Bar dataKey="count" fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Viewing outcomes
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.viewingOutcomes}>
                <CartesianGrid stroke="#e8ecf0" vertical={false} strokeDasharray="3 6" />
                <XAxis dataKey="outcome" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={11} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(196,92,38,0.08)" }} />
                <Bar dataKey="count" fill="#c45c26" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Wins by source
          </div>
          <div className="h-[220px]">
            {data.winsBySource.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                No wins in this range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.winsBySource.map((r) => ({
                    ...r,
                    label: portalLabel(r.source),
                  }))}
                >
                  <CartesianGrid stroke="#e8ecf0" vertical={false} strokeDasharray="3 6" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={11} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(21,128,61,0.08)" }} />
                  <Bar dataKey="count" fill="#15803d" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Listings by status
          </div>
          <ul className="space-y-2">
            {data.listingsByStatus.map((row) => (
              <li
                key={row.status}
                className="flex items-center justify-between rounded-[8px] border border-line px-3 py-2 text-sm"
              >
                <span className="font-semibold">{row.status}</span>
                <span className="text-muted">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Live portal listings
          </div>
          {livePortals.length === 0 ? (
            <p className="text-sm text-muted">No live publishes yet.</p>
          ) : (
            <ul className="space-y-2">
              {livePortals.map((row) => (
                <li
                  key={row.portal}
                  className="flex items-center justify-between rounded-[8px] border border-line px-3 py-2 text-sm"
                >
                  <span className="font-semibold">{row.portal}</span>
                  <span className="text-muted">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Agent load
          </div>
          {data.agentLeaderboard.length === 0 ? (
            <p className="text-sm text-muted">No assigned leads in this range.</p>
          ) : (
            <ul className="space-y-2">
              {data.agentLeaderboard.map((row) => (
                <li
                  key={row.agentId || row.name}
                  className="flex items-center justify-between rounded-[8px] border border-line px-3 py-2 text-sm"
                >
                  <span className="font-semibold">{row.name}</span>
                  <span className="text-muted">{row.leads} leads</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
