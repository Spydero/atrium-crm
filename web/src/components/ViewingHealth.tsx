"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, downloadFile, portalLabel } from "@/lib/api";
import { dateRangeQuery, type DateRangeValue } from "@/components/DateRangeFilter";

const OUTCOME_COLORS = {
  completed: "#15803d",
  noShow: "#d97706",
  cancelled: "#c45c26",
  unlogged: "#94a3b8",
  upcoming: "#cbd5e1",
} as const;

type Rates = {
  held: number | null;
  cancel: number | null;
  noShow: number | null;
  show: number | null;
  loggingCoverage: number | null;
  lateCancel: number | null;
};

type Totals = {
  booked: number;
  completed: number;
  noShow: number;
  cancelled: number;
  unlogged: number;
  upcoming: number;
  decided: number;
  duplicates: number;
};

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

export type ViewingHealthData = {
  range: { label: string; from: string; to: string; days: number };
  group: string;
  allowedGroups: string[];
  totals: Totals;
  rates: Rates;
  previous: { totals: Totals; rates: Rates } | null;
  deltasPp: { held: number | null; cancel: number | null; noShow: number | null; show: number | null } | null;
  reasons: { reason: string; label: string; party: string; count: number; share: number }[];
  parties: { party: string; count: number; share: number }[];
  notice: {
    sampleSize: number;
    since: string;
    medianHours: number | null;
    buckets: { key: string; count: number }[];
  };
  logging: { sampleSize: number; medianHours: number | null; within24hShare: number | null };
  series: {
    key: string;
    label: string;
    booked: number;
    completed: number;
    noShow: number;
    cancelled: number;
    unlogged: number;
    upcoming: number;
    held: number | null;
    cancel: number | null;
    noShowRate: number | null;
  }[];
  breakdowns: { agent: BreakRow[]; listing: BreakRow[]; source: BreakRow[] };
  recentCancellations: {
    id: string;
    startsAt: string;
    leadName: string | null;
    listingTitle: string | null;
    agentName: string | null;
    reasonLabel: string;
    noticeHours: number | null;
    notes: string | null;
  }[];
};

function pct(r: number | null) {
  if (r == null) return "-";
  return `${Math.round(r * 100)}%`;
}

function pctOf(n: number, d: number) {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function signedPp(n: number | null, invertGood = false) {
  if (n == null) return null;
  const good = invertGood ? n < 0 : n > 0;
  const bad = invertGood ? n > 0 : n < 0;
  const label = `${n > 0 ? "+" : ""}${n} pp`;
  return { label, good, bad, flat: n === 0 };
}

function fmtHours(h: number | null) {
  if (h == null) return "-";
  if (Math.abs(h) < 1) return `${Math.round(h * 60)}m`;
  if (Math.abs(h) < 48) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}

function trunc(s: string | null, n: number) {
  if (!s) return "-";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function Tip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[8px] border border-line bg-paper px-3 py-2 text-xs shadow-[0_8px_24px_rgba(16,20,24,0.1)]">
      <div className="font-bold text-ink">{label}</div>
      <ul className="mt-1 space-y-0.5">
        {payload
          .filter((p) => (p.value ?? 0) > 0 || p.dataKey === "heldPct")
          .map((p) => (
            <li key={String(p.dataKey)} className="flex justify-between gap-4">
              <span className="text-muted">{p.name}</span>
              <span className="font-semibold text-ink">
                {p.dataKey === "heldPct" ? `${p.value}%` : p.value}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function ViewingHealthPanel({
  range,
  embedded,
}: {
  range: DateRangeValue;
  /** When true, use summary.viewingHealth if passed via data prop path - we always fetch fresh. */
  embedded?: ViewingHealthData | null;
}) {
  const [data, setData] = useState<ViewingHealthData | null>(embedded ?? null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"counts" | "rates">("counts");
  const [breakKind, setBreakKind] = useState<"agent" | "listing" | "source">("agent");
  const [group, setGroup] = useState<"auto" | "day" | "week" | "month">("auto");

  useEffect(() => {
    if (embedded) {
      setData(embedded);
      return;
    }
    let live = true;
    const q = new URLSearchParams(dateRangeQuery(range));
    if (group !== "auto") q.set("group", group);
    api<ViewingHealthData>(`/api/reports/viewings?${q}`)
      .then((d) => {
        if (live) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Failed to load viewing health");
      });
    return () => {
      live = false;
    };
  }, [range.preset, range.from, range.to, group, embedded]);

  const series = useMemo(() => {
    if (!data) return [];
    return data.series.map((s) => {
      const decided = s.completed + s.noShow + s.cancelled;
      return {
        ...s,
        heldPct: s.held != null ? Math.round(s.held * 100) : null,
        completedShare: decided ? Math.round((s.completed / decided) * 100) : 0,
        noShowShare: decided ? Math.round((s.noShow / decided) * 100) : 0,
        cancelledShare: decided ? Math.round((s.cancelled / decided) * 100) : 0,
      };
    });
  }, [data]);

  if (error) return <p className="text-[var(--danger)]">{error}</p>;
  if (!data) {
    return <div className="surface h-64 animate-pulse" data-testid="viewing-health-loading" />;
  }

  const t = data.totals;
  const r = data.rates;
  const coverageLow = r.loggingCoverage != null && r.loggingCoverage < 0.8 && t.unlogged > 0;
  const breakRows = data.breakdowns[breakKind];
  const reasonMax = Math.max(1, ...data.reasons.map((x) => x.count));

  const tiles: {
    label: string;
    value: string;
    note: string;
    delta: ReturnType<typeof signedPp>;
  }[] = [
    {
      label: "Booked",
      value: String(t.booked),
      note: t.duplicates ? `${t.duplicates} duplicates removed` : `${t.decided} decided`,
      delta: null,
    },
    {
      label: "Held rate",
      value: pct(r.held),
      note: r.held == null ? "Not enough data" : `${t.completed} of ${t.decided}`,
      delta: signedPp(data.deltasPp?.held ?? null),
    },
    {
      label: "No-show rate",
      value: pct(r.noShow),
      note: r.noShow == null ? "Not enough data" : `${t.noShow} of ${t.decided}`,
      delta: signedPp(data.deltasPp?.noShow ?? null, true),
    },
    {
      label: "Cancel rate",
      value: pct(r.cancel),
      note: r.cancel == null ? "Not enough data" : `${t.cancelled} of ${t.decided}`,
      delta: signedPp(data.deltasPp?.cancel ?? null, true),
    },
    {
      label: "Unlogged",
      value: String(t.unlogged),
      note: t.upcoming ? `${t.upcoming} upcoming` : "past, no outcome yet",
      delta: null,
    },
  ];

  return (
    <div className="surface space-y-5 p-5" id="viewings" data-testid="viewing-health">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Viewing health
          </div>
          <p className="mt-1 text-sm text-muted">
            Outcomes for viewings scheduled in {data.range.label}. Rates use decided outcomes only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Group by"
            className="flex items-center gap-0.5 rounded-[8px] border border-line bg-paper p-0.5"
          >
            {(["auto", "day", "week", "month"] as const).map((g) => {
              const off = g !== "auto" && data.allowedGroups.length > 0 && !data.allowedGroups.includes(g);
              const pressed = group === g;
              return (
                <button
                  key={g}
                  type="button"
                  disabled={off}
                  aria-pressed={pressed}
                  onClick={() => setGroup(g)}
                  className={`rounded-[6px] px-2.5 py-1.5 text-xs font-bold capitalize transition ${
                    pressed ? "bg-accent text-white" : off ? "cursor-not-allowed text-muted/40" : "text-muted hover:bg-[#eef1f4] hover:text-ink"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() =>
              downloadFile(
                `/api/reports/viewings.csv?${dateRangeQuery(range)}&outcome=CANCELLED`,
                "cancellations.csv",
              )
            }
          >
            Export cancellations
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-[8px] border border-line px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{tile.label}</div>
            <div className="font-display mt-0.5 text-2xl font-bold tracking-[-0.03em]">{tile.value}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span>{tile.note}</span>
              {tile.delta && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    tile.delta.flat
                      ? "bg-[#eef1f4] text-muted"
                      : tile.delta.good
                        ? "bg-[#e3f4e8] text-[#15803d]"
                        : tile.delta.bad
                          ? "bg-[#fdeaea] text-[#b42318]"
                          : "bg-[#eef1f4] text-muted"
                  }`}
                >
                  {tile.delta.label}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {coverageLow && (
        <div className="rounded-[8px] border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {t.unlogged} viewing{t.unlogged === 1 ? "" : "s"} not logged - rates may be off.{" "}
          <Link href="/app/calendar?status=needs&type=VIEWING" className="font-bold underline">
            Open overdue in Calendar
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              Outcome trend · by {data.group}
            </div>
            <div
              role="group"
              aria-label="Chart mode"
              className="flex items-center gap-0.5 rounded-[8px] border border-line bg-paper p-0.5"
            >
              {(["counts", "rates"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-[6px] px-2.5 py-1 text-xs font-bold capitalize ${
                    mode === m ? "bg-accent text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[240px]">
            {t.booked === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                No viewings in this range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e8ecf0" vertical={false} strokeDasharray="3 6" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    fontSize={11}
                    domain={mode === "rates" ? [0, 100] : [0, (m: number) => Math.max(3, Math.ceil(m * 1.15))]}
                  />
                  {mode === "counts" && (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      fontSize={10}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                  )}
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(26,95,122,0.06)" }} />
                  {mode === "counts" ? (
                    <>
                      <Bar yAxisId="left" dataKey="completed" name="Completed" stackId="a" fill={OUTCOME_COLORS.completed} maxBarSize={36} />
                      <Bar yAxisId="left" dataKey="noShow" name="No-show" stackId="a" fill={OUTCOME_COLORS.noShow} maxBarSize={36} />
                      <Bar yAxisId="left" dataKey="cancelled" name="Cancelled" stackId="a" fill={OUTCOME_COLORS.cancelled} maxBarSize={36} />
                      <Bar yAxisId="left" dataKey="unlogged" name="Unlogged" stackId="a" fill={OUTCOME_COLORS.unlogged} maxBarSize={36} />
                      <Bar yAxisId="left" dataKey="upcoming" name="Upcoming" stackId="a" fill={OUTCOME_COLORS.upcoming} radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Line
                        yAxisId="right"
                        type="linear"
                        dataKey="heldPct"
                        name="Held rate"
                        stroke="#1a5f7a"
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                        connectNulls
                      />
                    </>
                  ) : (
                    <>
                      <Bar yAxisId="left" dataKey="completedShare" name="Held %" stackId="r" fill={OUTCOME_COLORS.completed} maxBarSize={36} />
                      <Bar yAxisId="left" dataKey="noShowShare" name="No-show %" stackId="r" fill={OUTCOME_COLORS.noShow} maxBarSize={36} />
                      <Bar yAxisId="left" dataKey="cancelledShare" name="Cancel %" stackId="r" fill={OUTCOME_COLORS.cancelled} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-muted">
            {[
              ["Completed", OUTCOME_COLORS.completed],
              ["No-show", OUTCOME_COLORS.noShow],
              ["Cancelled", OUTCOME_COLORS.cancelled],
              ["Unlogged", OUTCOME_COLORS.unlogged],
              ["Upcoming", OUTCOME_COLORS.upcoming],
            ].map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Why cancelled
          </div>
          {data.parties.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {data.parties.map((p) => (
                <span
                  key={p.party}
                  className="rounded-[6px] border border-line bg-[#f4f6f8] px-2 py-0.5 text-[11px] font-semibold text-ink"
                >
                  {p.party} · {pctOf(p.count, t.cancelled)}
                </span>
              ))}
            </div>
          )}
          {data.reasons.length === 0 ? (
            <p className="text-sm text-muted">No cancellations in this range.</p>
          ) : (
            <ul className="space-y-2">
              {data.reasons.map((row) => (
                <li key={row.reason}>
                  <div className="mb-0.5 flex justify-between gap-2 text-sm">
                    <span className="font-semibold">
                      {row.label}
                      {row.reason === "NOT_RECORDED" && (
                        <span className="ml-1.5 text-[10px] font-normal text-muted">
                          Logged before reasons were required
                        </span>
                      )}
                    </span>
                    <span className="text-muted">
                      {row.count} · {pctOf(row.count, t.cancelled)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#eef1f4]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(row.count / reasonMax) * 100}%`,
                        background: row.reason === "NOT_RECORDED" ? "#94a3b8" : OUTCOME_COLORS.cancelled,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Notice before cancelling
          </div>
          <p className="mb-3 text-xs text-muted">
            Based on {data.notice.sampleSize} cancellation
            {data.notice.sampleSize === 1 ? "" : "s"} since{" "}
            {new Date(data.notice.since).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {data.notice.medianHours != null && ` · median ${fmtHours(data.notice.medianHours)}`}
            {r.lateCancel != null && ` · late cancel ${pct(r.lateCancel)}`}
          </p>
          {data.notice.sampleSize < 5 ? (
            <p className="text-sm text-muted">Not enough data yet</p>
          ) : (
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.notice.buckets}>
                  <CartesianGrid stroke="#e8ecf0" vertical={false} strokeDasharray="3 6" />
                  <XAxis dataKey="key" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} fontSize={10} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="count" name="Cancellations" fill={OUTCOME_COLORS.cancelled} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Logging speed
          </div>
          <p className="mb-3 text-xs text-muted">
            How quickly completed and no-show outcomes are recorded after the viewing.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[8px] border border-line px-3 py-2">
              <div className="text-[10px] font-bold uppercase text-muted">Median delay</div>
              <div className="font-display mt-0.5 text-xl font-bold">
                {fmtHours(data.logging.medianHours)}
              </div>
            </div>
            <div className="rounded-[8px] border border-line px-3 py-2">
              <div className="text-[10px] font-bold uppercase text-muted">Within 24h</div>
              <div className="font-display mt-0.5 text-xl font-bold">
                {pct(data.logging.within24hShare)}
              </div>
            </div>
            <div className="rounded-[8px] border border-line px-3 py-2">
              <div className="text-[10px] font-bold uppercase text-muted">Unlogged</div>
              <div className="font-display mt-0.5 text-xl font-bold">{t.unlogged}</div>
              {t.unlogged > 0 && (
                <Link href="/app/calendar?status=needs&type=VIEWING" className="text-[11px] font-bold text-accent hover:underline">
                  Calendar
                </Link>
              )}
            </div>
          </div>
          {data.logging.sampleSize < 5 && (
            <p className="mt-2 text-xs text-muted">Not enough logged outcomes since 31 Oct 2026 for lag stats.</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Breakdown</div>
          <div
            role="group"
            aria-label="Breakdown by"
            className="flex items-center gap-0.5 rounded-[8px] border border-line bg-paper p-0.5"
          >
            {(["agent", "listing", "source"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={breakKind === k}
                onClick={() => setBreakKind(k)}
                className={`rounded-[6px] px-2.5 py-1 text-xs font-bold capitalize ${
                  breakKind === k ? "bg-accent text-white" : "text-muted hover:text-ink"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                <th className="py-2 pr-3">{breakKind === "agent" ? "Agent" : breakKind === "listing" ? "Listing" : "Source"}</th>
                <th className="pr-3 text-right">Booked</th>
                <th className="pr-3 text-right">Held %</th>
                <th className="pr-3 text-right">No-show %</th>
                <th className="pr-3 text-right">Cancel %</th>
                <th className="pr-3 text-right">Unlogged</th>
                <th className="text-right">Top cancel reason</th>
              </tr>
            </thead>
            <tbody>
              {breakRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted">
                    No rows
                  </td>
                </tr>
              ) : (
                breakRows.map((row) => {
                  const faded = row.held == null;
                  const label =
                    breakKind === "source" && row.label !== "No lead" && row.label !== "Other"
                      ? portalLabel(row.label)
                      : row.label;
                  return (
                    <tr key={row.key} className="border-b border-line/60 last:border-0">
                      <td className="py-2 pr-3 font-semibold">{label}</td>
                      <td className="pr-3 text-right">{row.booked}</td>
                      <td className={`pr-3 text-right ${faded ? "text-muted/50" : ""}`}>{pct(row.held)}</td>
                      <td className={`pr-3 text-right ${faded ? "text-muted/50" : ""}`}>{pct(row.noShowRate)}</td>
                      <td className={`pr-3 text-right ${faded ? "text-muted/50" : ""}`}>{pct(row.cancel)}</td>
                      <td className="pr-3 text-right">{row.unlogged}</td>
                      <td className="text-right text-muted">{row.topCancelReason || "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Recent cancellations
          </div>
          <button
            type="button"
            className="text-xs font-bold text-accent hover:underline"
            onClick={() =>
              downloadFile(
                `/api/reports/viewings.csv?${dateRangeQuery(range)}&outcome=CANCELLED`,
                "cancellations.csv",
              )
            }
          >
            Export cancellations (CSV)
          </button>
        </div>
        {data.recentCancellations.length === 0 ? (
          <p className="text-sm text-muted">No cancellations in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-3">Date</th>
                  <th className="pr-3">Lead</th>
                  <th className="pr-3">Listing</th>
                  <th className="pr-3">Agent</th>
                  <th className="pr-3">Reason</th>
                  <th className="pr-3 text-right">Notice</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCancellations.map((row) => {
                  const d = new Date(row.startsAt);
                  return (
                    <tr key={row.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/app/calendar?date=${d.toISOString().slice(0, 10)}&type=VIEWING&status=cancelled`}
                          className="font-semibold text-accent hover:underline"
                        >
                          {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </Link>
                      </td>
                      <td className="pr-3">{row.leadName || "-"}</td>
                      <td className="pr-3 text-muted">{row.listingTitle || "-"}</td>
                      <td className="pr-3 text-muted">{row.agentName || "-"}</td>
                      <td className="pr-3 font-semibold">{row.reasonLabel}</td>
                      <td className="pr-3 text-right text-muted">{fmtHours(row.noticeHours)}</td>
                      <td className="max-w-[200px] text-muted">{trunc(row.notes, 80)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact dashboard card linking to Reports viewing health. */
export function ViewingHealthCard({ range }: { range: DateRangeValue }) {
  const [data, setData] = useState<{
    totals: Totals;
    rates: Rates;
    deltasPp: ViewingHealthData["deltasPp"];
  } | null>(null);

  useEffect(() => {
    let live = true;
    api<ViewingHealthData>(`/api/reports/viewings?${dateRangeQuery(range)}&detail=headline`)
      .then((d) => {
        if (live) setData({ totals: d.totals, rates: d.rates, deltasPp: d.deltasPp });
      })
      .catch(() => {
        if (live) setData(null);
      });
    return () => {
      live = false;
    };
  }, [range.preset, range.from, range.to]);

  if (!data || data.totals.booked === 0) {
    return (
      <Link
        href="/app/reports#viewings"
        className="surface block p-5 transition hover:-translate-y-0.5 hover:border-ink/20"
        data-testid="viewing-health-card"
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Viewing health</div>
        <p className="mt-3 text-sm text-muted">No viewings in this range. Open Reports for the full view.</p>
      </Link>
    );
  }

  const rows = [
    { label: "Held", rate: data.rates.held, delta: signedPp(data.deltasPp?.held ?? null) },
    { label: "No-show", rate: data.rates.noShow, delta: signedPp(data.deltasPp?.noShow ?? null, true) },
    { label: "Cancel", rate: data.rates.cancel, delta: signedPp(data.deltasPp?.cancel ?? null, true) },
  ];

  return (
    <Link
      href="/app/reports#viewings"
      className="surface block p-5 transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_12px_28px_rgba(16,20,24,0.07)]"
      data-testid="viewing-health-card"
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Viewing health</div>
        <span className="text-xs text-muted">{data.totals.booked} booked</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{row.label}</div>
            <div className="font-display text-xl font-bold tracking-[-0.03em]">{pct(row.rate)}</div>
            {row.delta && (
              <div
                className={`text-[10px] font-bold ${
                  row.delta.flat
                    ? "text-muted"
                    : row.delta.good
                      ? "text-[#15803d]"
                      : "text-[#b42318]"
                }`}
              >
                {row.delta.label}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs font-semibold text-accent">Open full report →</div>
    </Link>
  );
}
