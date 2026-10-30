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
    return <p className="text-muted">Loading…</p>;
  }

  return (
    <div className="animate-rise space-y-5">
      <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">
        Dashboard
      </h1>

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="surface p-4 lg:col-span-2">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            New leads
          </div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kpis.newLeadsChart}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="count" fill="#1a5f7a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="surface flex flex-col justify-between p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            Close rate
          </div>
          <div className="font-display text-5xl font-bold tracking-[-0.04em] text-accent">
            {kpis.closeRate}%
          </div>
        </div>
        <div className="grid gap-3">
          <div className="surface p-4">
            <div className="font-display text-3xl font-bold tracking-[-0.03em]">
              {kpis.openLeads}
            </div>
            <div className="text-sm text-muted">Open leads</div>
          </div>
          <div className="surface p-4">
            <div className="font-display text-2xl font-bold tracking-[-0.03em]">
              {formatAed(kpis.pipelineAed)}
            </div>
            <div className="text-sm text-muted">Pipeline</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface p-4">
          <div className="text-sm text-muted">Viewings this week</div>
          <div className="font-display mt-1 text-3xl font-bold tracking-[-0.03em]">
            {kpis.viewingsWeek}
          </div>
        </div>
        <div className="surface p-4">
          <div className="text-sm text-muted">Active listings</div>
          <div className="font-display mt-1 text-3xl font-bold tracking-[-0.03em]">
            {kpis.listingsActive}
          </div>
        </div>
      </div>
    </div>
  );
}
