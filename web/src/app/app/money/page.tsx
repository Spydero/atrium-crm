"use client";

import { useEffect, useState } from "react";
import { api, formatAed, portalLabel } from "@/lib/api";

type MoneyMap = {
  rows: {
    source: string;
    leads: number;
    completedViewings: number;
    wins: number;
    wonValueAed: number;
    monthlySpendAed: number;
    costPerViewing: number | null;
    costPerWin: number | null;
  }[];
  atRiskAed: number;
  overdueCount: number;
  overdue: {
    id: string;
    title: string;
    startsAt: string;
    leadName?: string;
    dealValueAed?: number | null;
  }[];
};

export default function MoneyPage() {
  const [data, setData] = useState<MoneyMap | null>(null);

  useEffect(() => {
    api<MoneyMap>("/api/money/map").then(setData).catch(console.error);
  }, []);

  if (!data) return <p className="text-muted">Loading Money Map…</p>;

  return (
    <div className="animate-rise space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Money Map</h1>
        <p className="text-muted">
          Source ROI on completed viewings and wins — not vanity lead counts.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-sm font-semibold text-amber-800">At-risk pipeline</div>
          <div className="font-display mt-1 text-3xl font-bold text-amber-900">
            {formatAed(data.atRiskAed)}
          </div>
          <div className="mt-1 text-sm text-amber-800/80">
            {data.overdueCount} overdue follow-up(s) × deal value
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-5">
          <div className="mb-2 text-sm font-semibold">Overdue</div>
          <ul className="space-y-2 text-sm">
            {data.overdue.slice(0, 5).map((o) => (
              <li key={o.id} className="flex justify-between gap-2">
                <span>{o.title}</span>
                <span className="text-muted">{formatAed(o.dealValueAed || 0)}</span>
              </li>
            ))}
            {!data.overdue.length && (
              <li className="text-muted">Nothing overdue — nice.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line bg-canvas/80 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Leads</th>
              <th className="px-4 py-3 font-semibold">Viewings done</th>
              <th className="px-4 py-3 font-semibold">Wins</th>
              <th className="px-4 py-3 font-semibold">Won value</th>
              <th className="px-4 py-3 font-semibold">Spend / mo</th>
              <th className="px-4 py-3 font-semibold">Cost / viewing</th>
              <th className="px-4 py-3 font-semibold">Cost / win</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.source} className="border-b border-line/70">
                <td className="px-4 py-3 font-semibold">{portalLabel(r.source)}</td>
                <td className="px-4 py-3">{r.leads}</td>
                <td className="px-4 py-3">{r.completedViewings}</td>
                <td className="px-4 py-3">{r.wins}</td>
                <td className="px-4 py-3">{formatAed(r.wonValueAed)}</td>
                <td className="px-4 py-3">{formatAed(r.monthlySpendAed)}</td>
                <td className="px-4 py-3">
                  {r.costPerViewing != null ? formatAed(r.costPerViewing) : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.costPerWin != null ? formatAed(r.costPerWin) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
