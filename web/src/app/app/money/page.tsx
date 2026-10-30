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

  if (!data) return <p className="text-muted">Loading…</p>;

  return (
    <div className="animate-rise space-y-4">
      <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">
        Money Map
      </h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-[var(--mark)]/25 bg-[var(--mark-soft)] p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--mark)]">
            At risk
          </div>
          <div className="font-display mt-1 text-3xl font-bold tracking-[-0.03em] text-[var(--mark)]">
            {formatAed(data.atRiskAed)}
          </div>
          <div className="mt-1 text-sm text-[var(--mark)]/80">
            {data.overdueCount} overdue · deal value
          </div>
        </div>
        <div className="surface p-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Overdue
          </div>
          <ul className="space-y-2 text-sm">
            {data.overdue.slice(0, 5).map((o) => (
              <li key={o.id} className="flex justify-between gap-2">
                <span className="truncate font-medium">{o.title}</span>
                <span className="shrink-0 text-muted">{formatAed(o.dealValueAed || 0)}</span>
              </li>
            ))}
            {!data.overdue.length && <li className="text-muted">None</li>}
          </ul>
        </div>
      </div>

      <div className="surface overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line bg-[#f3f5f7] text-[11px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <th className="px-4 py-3 font-bold">Source</th>
              <th className="px-4 py-3 font-bold">Leads</th>
              <th className="px-4 py-3 font-bold">Viewings</th>
              <th className="px-4 py-3 font-bold">Wins</th>
              <th className="px-4 py-3 font-bold">Won value</th>
              <th className="px-4 py-3 font-bold">Spend / mo</th>
              <th className="px-4 py-3 font-bold">Cost / viewing</th>
              <th className="px-4 py-3 font-bold">Cost / win</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.source} className="border-b border-line/70">
                <td className="px-4 py-3 font-bold">{portalLabel(r.source)}</td>
                <td className="px-4 py-3">{r.leads}</td>
                <td className="px-4 py-3">{r.completedViewings}</td>
                <td className="px-4 py-3">{r.wins}</td>
                <td className="px-4 py-3">{formatAed(r.wonValueAed)}</td>
                <td className="px-4 py-3">{formatAed(r.monthlySpendAed)}</td>
                <td className="px-4 py-3">
                  {r.costPerViewing != null ? formatAed(r.costPerViewing) : "-"}
                </td>
                <td className="px-4 py-3">
                  {r.costPerWin != null ? formatAed(r.costPerWin) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
