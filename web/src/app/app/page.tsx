"use client";

import { useEffect, useState } from "react";
import { api, formatAed } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type Kpis = {
  openLeads: number;
  pipelineAed: number;
  viewingsWeek: number;
  closeRate: number;
  listingsActive: number;
  newLeadsChart: { day: string; count: number }[];
};

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    api<Kpis>("/api/dashboard/kpis").then(setKpis).catch(console.error);
  }, []);

  if (!kpis) {
    return <p className="text-muted">Loading dashboard…</p>;
  }

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted">Pipeline health for your brokerage today.</p>
      </div>

      <div className="grid gap-4 rounded-2xl border border-line bg-[#f7f5f1] p-5 lg:grid-cols-4">
        <div className="rounded-xl bg-paper p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-semibold text-muted">New leads (7d)</div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kpis.newLeadsChart}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="count" fill="#0b6e4f" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl bg-paper p-4">
          <div className="text-sm text-muted">Close rate</div>
          <div className="font-display mt-2 text-4xl font-bold text-cove">
            {kpis.closeRate}%
          </div>
          <div className="mt-1 text-xs text-muted">Won vs open+won</div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl bg-paper p-4">
            <div className="text-2xl font-bold">{kpis.openLeads}</div>
            <div className="text-sm text-muted">Open leads</div>
          </div>
          <div className="rounded-xl bg-paper p-4">
            <div className="text-2xl font-bold">{formatAed(kpis.pipelineAed)}</div>
            <div className="text-sm text-muted">Pipeline value</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper p-5">
          <div className="text-sm text-muted">Viewings this week</div>
          <div className="font-display mt-1 text-3xl font-bold">{kpis.viewingsWeek}</div>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-5">
          <div className="text-sm text-muted">Active listings</div>
          <div className="font-display mt-1 text-3xl font-bold">{kpis.listingsActive}</div>
        </div>
      </div>
    </div>
  );
}
