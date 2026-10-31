import { LeadSource } from "@prisma/client";
import { prisma } from "./prisma.js";
import { previousRange, type ResolvedRange, localKey, startOfDay } from "./dateRange.js";

export const ALL_SOURCES = Object.values(LeadSource);

export type SpendStatus = "entered" | "zero" | "none";
export type CueKind = "ADD_SPEND" | "ORGANIC" | "TOO_EARLY" | "CUT" | "REVIEW" | "SCALE" | "HOLD";
export type DeltaDir = "better" | "worse" | "flat";

export type MetricDelta = {
  abs: number;
  pct: number | null;
  direction: DeltaDir;
};

export type SourceMetrics = {
  spend: number | null;
  spendStatus: SpendStatus;
  spendPartial: boolean;
  leads: number;
  viewings: number;
  wins: number;
  sharedWins: number;
  wonValue: number;
  costPerViewing: number | null;
  costPerWin: number | null;
  /** 0..1 rate */
  leadToViewingPct: number | null;
  /** 0..1 rate */
  viewingToWinPct: number | null;
};

export type MoneyRow = SourceMetrics & {
  source: LeadSource;
  atRisk: { value: number; leads: number; items: number };
  prev: SourceMetrics;
  delta: Record<string, MetricDelta | null>;
  cue: { kind: CueKind; reason: string };
};

export type MoneyMapResult = {
  range: {
    preset: string;
    label: string;
    from: string;
    to: string;
    days: number;
  };
  previous: { from: string; to: string; label: string };
  currency: { code: "AED"; label: "AED" };
  attribution: "all_touch";
  totals: SourceMetrics & {
    prev: SourceMetrics;
    delta: Record<string, MetricDelta | null>;
  };
  rows: MoneyRow[];
  benchmarks: {
    medianCostPerViewing: number | null;
    medianCostPerWin: number | null;
    eligibleSources: number;
  };
  callouts: {
    best: { source: LeadSource; metric: string; value: number } | null;
    worst: { source: LeadSource; metric: string; value: number } | null;
    reallocation: {
      from: LeadSource;
      to: LeadSource;
      amount: number;
      extraViewings: number;
    } | null;
    missingSpend: LeadSource[];
  };
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
      sources: LeadSource[];
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

type SpendEntry = { source: LeadSource; month: Date; amount: number };

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthStart(ym: string): Date {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function inRange(d: Date, from: Date, to: Date) {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function median(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round1(n: number) {
  return Math.round(n * 1000) / 1000;
}

function costs(spend: number | null, viewings: number, wins: number) {
  return {
    costPerViewing: spend != null && viewings > 0 ? Math.round(spend / viewings) : null,
    costPerWin: spend != null && wins > 0 ? Math.round(spend / wins) : null,
  };
}

export function resolveSpendForRange(
  entries: SpendEntry[],
  source: LeadSource,
  range: { from: Date; to: Date },
): { spend: number | null; status: SpendStatus; partial: boolean } {
  const mine = entries
    .filter((e) => e.source === source)
    .map((e) => ({ ym: monthKey(e.month), amount: e.amount, t: startOfDay(e.month).getTime() }))
    .sort((a, b) => a.t - b.t);

  let sum = 0;
  let known = 0;
  let nullDays = 0;
  let sawZero = false;
  let sawPositive = false;

  const cursor = startOfDay(range.from);
  const last = startOfDay(range.to);
  while (cursor <= last) {
    const ym = monthKey(cursor);
    const exact = mine.find((m) => m.ym === ym);
    let amount: number | null = null;
    if (exact) amount = exact.amount;
    else {
      const earlier = [...mine].reverse().find((m) => m.t < monthStart(ym).getTime());
      if (earlier) amount = earlier.amount;
    }

    if (amount == null) nullDays += 1;
    else {
      known += 1;
      if (amount === 0) sawZero = true;
      if (amount > 0) sawPositive = true;
      sum += amount / daysInMonth(ym);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (known === 0) return { spend: null, status: "none", partial: false };
  if (!sawPositive && sawZero) {
    return { spend: 0, status: "zero", partial: nullDays > 0 };
  }
  return {
    spend: Math.round(sum),
    status: "entered",
    partial: nullDays > 0,
  };
}

export function deltaOf(
  cur: number | null,
  prev: number | null,
  invertBetter = false,
): MetricDelta | null {
  if (cur == null || prev == null) return null;
  const abs = cur - prev;
  const pct = prev === 0 ? null : Math.round((abs / prev) * 100);
  let direction: DeltaDir = abs === 0 ? "flat" : abs > 0 ? "better" : "worse";
  if (invertBetter && abs !== 0) direction = abs < 0 ? "better" : "worse";
  return { abs, pct, direction };
}

function emptyMetrics(): SourceMetrics {
  return {
    spend: null,
    spendStatus: "none",
    spendPartial: false,
    leads: 0,
    viewings: 0,
    wins: 0,
    sharedWins: 0,
    wonValue: 0,
    costPerViewing: null,
    costPerWin: null,
    leadToViewingPct: null,
    viewingToWinPct: null,
  };
}

function metricsDelta(cur: SourceMetrics, prev: SourceMetrics): Record<string, MetricDelta | null> {
  return {
    spend: deltaOf(cur.spend, prev.spend),
    leads: deltaOf(cur.leads, prev.leads),
    viewings: deltaOf(cur.viewings, prev.viewings),
    wins: deltaOf(cur.wins, prev.wins),
    wonValue: deltaOf(cur.wonValue, prev.wonValue),
    costPerViewing: deltaOf(cur.costPerViewing, prev.costPerViewing, true),
    costPerWin: deltaOf(cur.costPerWin, prev.costPerWin, true),
    leadToViewingPct: deltaOf(cur.leadToViewingPct, prev.leadToViewingPct),
    viewingToWinPct: deltaOf(cur.viewingToWinPct, prev.viewingToWinPct),
  };
}

export function cueFor(
  row: SourceMetrics & {
    atRiskLeads?: number;
    prevCpv?: number | null;
    medianLeadToViewing?: number | null;
  },
  medianCpv: number | null,
  _medianCpw: number | null,
  rangeDays: number,
): { kind: CueKind; reason: string } {
  if (row.spendStatus === "none" && row.leads >= 1) {
    return { kind: "ADD_SPEND", reason: `${row.leads} leads but no spend entered` };
  }
  if (row.spendStatus === "zero" || row.spend === 0) {
    return { kind: "ORGANIC", reason: "Entered spend is 0 - volume only, no cost verdict" };
  }
  if (row.leads < 5 || rangeDays < 14) {
    return {
      kind: "TOO_EARLY",
      reason: row.leads < 5 ? `Only ${row.leads} leads so far` : `Range is ${rangeDays} days - short for ROI`,
    };
  }
  if (row.leads >= 10 && row.viewings === 0) {
    return { kind: "CUT", reason: `${row.leads} leads and 0 completed viewings` };
  }
  if (
    rangeDays >= 30 &&
    row.wins === 0 &&
    row.costPerViewing != null &&
    medianCpv != null &&
    row.costPerViewing >= 2 * medianCpv
  ) {
    return {
      kind: "CUT",
      reason: `Cost per viewing ${row.costPerViewing} is 2x+ the median ${medianCpv}, with 0 wins`,
    };
  }
  if (row.costPerViewing != null && medianCpv != null && row.costPerViewing >= 1.5 * medianCpv) {
    return {
      kind: "REVIEW",
      reason: `Cost per viewing ${row.costPerViewing} is 50%+ above median ${medianCpv}`,
    };
  }
  if (
    row.prevCpv != null &&
    row.costPerViewing != null &&
    row.viewings >= 3 &&
    row.prevCpv > 0 &&
    (row.costPerViewing - row.prevCpv) / row.prevCpv >= 0.3
  ) {
    return {
      kind: "REVIEW",
      reason: `Cost per viewing rose ${Math.round(((row.costPerViewing - row.prevCpv) / row.prevCpv) * 100)}% vs previous period`,
    };
  }
  if ((row.atRiskLeads ?? 0) >= 3) {
    return { kind: "REVIEW", reason: `${row.atRiskLeads} leads at risk on this source` };
  }
  if (
    medianCpv != null &&
    row.viewings >= 3 &&
    row.costPerViewing != null &&
    row.costPerViewing <= 0.75 * medianCpv &&
    (row.wins >= 1 ||
      (row.leadToViewingPct != null &&
        row.medianLeadToViewing != null &&
        row.leadToViewingPct >= row.medianLeadToViewing))
  ) {
    return {
      kind: "SCALE",
      reason: `Cost per viewing ${row.costPerViewing} is 25%+ below median ${medianCpv}`,
    };
  }
  return {
    kind: "HOLD",
    reason: `${row.leads} leads, ${row.viewings} viewings, and ${row.wins} wins are in line with the pack`,
  };
}

export type CalloutMedians = {
  medianCostPerViewing?: number | null;
  medianCostPerWin?: number | null;
  cpv?: number | null;
  cpw?: number | null;
  rangeDays?: number;
  days?: number;
};

export function pickCallouts(
  rows: MoneyRow[],
  medians: CalloutMedians,
): MoneyMapResult["callouts"] {
  const rangeDays = medians.rangeDays ?? medians.days ?? 30;
  const eligible = rows.filter((r) => r.spend != null && r.spend > 0 && r.viewings >= 3 && r.costPerViewing != null);
  let best: MoneyMapResult["callouts"]["best"] = null;
  let worst: MoneyMapResult["callouts"]["worst"] = null;
  let reallocation: MoneyMapResult["callouts"]["reallocation"] = null;

  if (eligible.length >= 2) {
    const sorted = [...eligible].sort((a, b) => (a.costPerViewing ?? 0) - (b.costPerViewing ?? 0));
    const b = sorted[0];
    const w = sorted[sorted.length - 1];
    best = { source: b.source, metric: "costPerViewing", value: b.costPerViewing! };
    worst = { source: w.source, metric: "costPerViewing", value: w.costPerViewing! };
    if ((w.cue.kind === "REVIEW" || w.cue.kind === "CUT") && w.spend && b.costPerViewing && w.costPerViewing) {
      const months = Math.max(1, rangeDays / 30);
      const amount = Math.round((w.spend * 0.25) / months);
      const extra = Math.floor(amount / b.costPerViewing - amount / w.costPerViewing);
      if (extra >= 1) {
        reallocation = { from: w.source, to: b.source, amount, extraViewings: extra };
      }
    }
  }

  return {
    best,
    worst,
    reallocation,
    missingSpend: rows.filter((r) => r.leads >= 1 && r.spendStatus === "none").map((r) => r.source),
  };
}

type RawBundle = {
  events: { leadId: string; source: LeadSource; createdAt: Date }[];
  viewings: {
    id: string;
    startsAt: Date;
    leadId: string | null;
    sources: { source: LeadSource; createdAt: Date }[];
  }[];
  wins: {
    id: string;
    dealValueAed: number | null;
    stage: string;
    wonAt: Date | null;
    updatedAt: Date;
    sources: { source: LeadSource; createdAt: Date }[];
  }[];
  allViewingsByLead: Map<string, boolean>;
  spend: SpendEntry[];
};

function credited(sources: { source: LeadSource; createdAt: Date }[], source: LeadSource, at: Date) {
  return sources.some((s) => s.source === source && s.createdAt.getTime() <= at.getTime());
}

function winAt(w: { stage: string; wonAt: Date | null; updatedAt: Date }) {
  if (w.stage !== "WON") return null;
  return w.wonAt ?? w.updatedAt;
}

function metricsFor(
  source: LeadSource | null,
  range: { from: Date; to: Date },
  raw: RawBundle,
): SourceMetrics {
  const spendRes =
    source == null
      ? { spend: null as number | null, status: "none" as SpendStatus, partial: false }
      : resolveSpendForRange(raw.spend, source, range);

  // For totals, sum spend across sources separately by the caller.
  const leadIds = new Set<string>();
  for (const e of raw.events) {
    if (!inRange(e.createdAt, range.from, range.to)) continue;
    if (source && e.source !== source) continue;
    leadIds.add(e.leadId);
  }

  const viewingIds = new Set<string>();
  const viewingLeadIds = new Set<string>();
  for (const v of raw.viewings) {
    if (!v.leadId || !inRange(v.startsAt, range.from, range.to)) continue;
    if (source && !credited(v.sources, source, v.startsAt)) continue;
    if (!source && !v.sources.some((s) => s.createdAt.getTime() <= v.startsAt.getTime())) continue;
    viewingIds.add(v.id);
    viewingLeadIds.add(v.leadId);
  }

  let wins = 0;
  let sharedWins = 0;
  let wonValue = 0;
  const winLeadIds = new Set<string>();
  for (const w of raw.wins) {
    const at = winAt(w);
    if (!at || !inRange(at, range.from, range.to)) continue;
    if (source && !credited(w.sources, source, at)) continue;
    if (!source && !w.sources.some((s) => s.createdAt.getTime() <= at.getTime())) continue;
    if (winLeadIds.has(w.id)) continue;
    winLeadIds.add(w.id);
    wins += 1;
    wonValue += w.dealValueAed ?? 0;
    if (source) {
      const others = w.sources.some(
        (s) => s.source !== source && s.createdAt.getTime() <= at.getTime(),
      );
      if (others) sharedWins += 1;
    }
  }

  let viewedInCohort = 0;
  let wonAfterView = 0;
  for (const id of leadIds) {
    if (raw.allViewingsByLead.get(id)) {
      viewedInCohort += 1;
      if (raw.wins.some((w) => w.id === id && w.stage === "WON")) wonAfterView += 1;
    }
  }

  const baseSpend = source == null ? null : spendRes.spend;
  const c = costs(baseSpend, viewingIds.size, wins);

  return {
    spend: baseSpend,
    spendStatus: source == null ? "none" : spendRes.status,
    spendPartial: source == null ? false : spendRes.partial,
    leads: leadIds.size,
    viewings: viewingIds.size,
    wins,
    sharedWins,
    wonValue,
    costPerViewing: c.costPerViewing,
    costPerWin: c.costPerWin,
    leadToViewingPct: leadIds.size ? round1(viewedInCohort / leadIds.size) : null,
    viewingToWinPct: viewedInCohort ? round1(wonAfterView / viewedInCohort) : null,
  };
}

export async function computeMoneyMap(
  organizationId: string,
  range: ResolvedRange,
): Promise<MoneyMapResult> {
  const prev = previousRange(range);
  const now = new Date();

  const [events, viewings, wins, spendRows, overdue, completedEver] = await Promise.all([
    prisma.leadSourceEvent.findMany({
      where: { lead: { organizationId } },
      select: { leadId: true, source: true, createdAt: true },
    }),
    prisma.calendarEvent.findMany({
      where: {
        organizationId,
        type: "VIEWING",
        outcome: "COMPLETED",
        startsAt: { gte: prev.from, lte: range.to },
      },
      select: {
        id: true,
        startsAt: true,
        leadId: true,
        lead: { select: { sources: { select: { source: true, createdAt: true } } } },
      },
    }),
    prisma.lead.findMany({
      where: { organizationId, stage: "WON" },
      select: {
        id: true,
        dealValueAed: true,
        stage: true,
        wonAt: true,
        updatedAt: true,
        sources: { select: { source: true, createdAt: true } },
      },
    }),
    prisma.sourceSpend.findMany({
      where: { organizationId },
      select: { source: true, month: true, amount: true },
    }),
    prisma.calendarEvent.findMany({
      where: {
        organizationId,
        startsAt: { lt: now },
        leadId: { not: null },
        OR: [{ outcome: "SCHEDULED" }, { outcome: null }],
        lead: { stage: { notIn: ["WON", "LOST"] } },
      },
      select: {
        id: true,
        title: true,
        type: true,
        startsAt: true,
        leadId: true,
        lead: {
          select: {
            id: true,
            name: true,
            stage: true,
            dealValueAed: true,
            sources: { select: { source: true } },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.calendarEvent.findMany({
      where: { organizationId, type: "VIEWING", outcome: "COMPLETED", leadId: { not: null } },
      select: { leadId: true },
      distinct: ["leadId"],
    }),
  ]);

  const allViewingsByLead = new Map<string, boolean>();
  for (const v of completedEver) {
    if (v.leadId) allViewingsByLead.set(v.leadId, true);
  }

  const raw: RawBundle = {
    events,
    viewings: viewings.map((v) => ({
      id: v.id,
      startsAt: v.startsAt,
      leadId: v.leadId,
      sources: v.lead?.sources ?? [],
    })),
    wins,
    allViewingsByLead,
    spend: spendRows,
  };

  // At risk: group by lead
  const byLead = new Map<
    string,
    {
      leadId: string;
      leadName: string;
      stage: string;
      dealValue: number | null;
      sources: LeadSource[];
      items: typeof overdue;
    }
  >();
  for (const e of overdue) {
    if (!e.lead || !e.leadId) continue;
    const cur = byLead.get(e.leadId);
    if (cur) cur.items.push(e);
    else {
      byLead.set(e.leadId, {
        leadId: e.leadId,
        leadName: e.lead.name,
        stage: e.lead.stage,
        dealValue: e.lead.dealValueAed,
        sources: [...new Set(e.lead.sources.map((s) => s.source))],
        items: [e],
      });
    }
  }
  const atRiskLeads = [...byLead.values()].sort(
    (a, b) => (b.dealValue ?? 0) - (a.dealValue ?? 0),
  );
  const atRiskValue = atRiskLeads.reduce((s, l) => s + (l.dealValue ?? 0), 0);
  const unvaluedLeads = atRiskLeads.filter((l) => l.dealValue == null || l.dealValue === 0).length;
  const atRiskBySource = new Map<LeadSource, { value: number; leads: number; items: number }>();
  for (const s of ALL_SOURCES) atRiskBySource.set(s, { value: 0, leads: 0, items: 0 });
  for (const l of atRiskLeads) {
    for (const src of l.sources) {
      const cell = atRiskBySource.get(src)!;
      cell.leads += 1;
      cell.items += l.items.length;
      cell.value += l.dealValue ?? 0;
    }
  }

  const rows: MoneyRow[] = ALL_SOURCES.map((source) => {
    const cur = metricsFor(source, range, raw);
    const prevM = metricsFor(source, prev, raw);
    const atRisk = atRiskBySource.get(source)!;
    return {
      source,
      ...cur,
      atRisk,
      prev: prevM,
      delta: metricsDelta(cur, prevM),
      cue: { kind: "HOLD", reason: "" }, // filled after medians
    };
  });

  const eligibleCpv = rows
    .filter((r) => r.spend != null && r.spend > 0 && r.viewings >= 3 && r.costPerViewing != null)
    .map((r) => r.costPerViewing!);
  const eligibleCpw = rows
    .filter((r) => r.spend != null && r.spend > 0 && r.wins >= 1 && r.costPerWin != null)
    .map((r) => r.costPerWin!);
  const medianCpv = median(eligibleCpv);
  const medianCpw = median(eligibleCpw);
  const medianL2V = median(
    rows
      .filter((r) => r.spend != null && r.spend > 0 && r.viewings >= 3 && r.leadToViewingPct != null)
      .map((r) => r.leadToViewingPct!),
  );

  for (const r of rows) {
    r.cue = cueFor(
      {
        ...r,
        atRiskLeads: r.atRisk.leads,
        prevCpv: r.prev.costPerViewing,
        medianLeadToViewing: medianL2V,
      },
      medianCpv,
      medianCpw,
      range.days,
    );
  }

  // Totals: distinct across sources
  const totalCur = metricsFor(null, range, raw);
  const totalPrev = metricsFor(null, prev, raw);
  let totalSpend = 0;
  let totalSpendKnown = false;
  let totalPrevSpend = 0;
  let totalPrevKnown = false;
  for (const r of rows) {
    if (r.spend != null) {
      totalSpend += r.spend;
      totalSpendKnown = true;
    }
    if (r.prev.spend != null) {
      totalPrevSpend += r.prev.spend;
      totalPrevKnown = true;
    }
  }
  totalCur.spend = totalSpend;
  totalCur.spendStatus = totalSpendKnown ? (totalSpend > 0 ? "entered" : "zero") : "none";
  Object.assign(totalCur, costs(totalCur.spend, totalCur.viewings, totalCur.wins));
  totalPrev.spend = totalPrevSpend;
  totalPrev.spendStatus = totalPrevKnown ? (totalPrevSpend > 0 ? "entered" : "zero") : "none";
  Object.assign(totalPrev, costs(totalPrev.spend, totalPrev.viewings, totalPrev.wins));

  const callouts = pickCallouts(rows, {
    medianCostPerViewing: medianCpv,
    medianCostPerWin: medianCpw,
    rangeDays: range.days,
  });

  return {
    range: {
      preset: range.preset,
      label: range.label,
      from: range.fromKey,
      to: range.toKey,
      days: range.days,
    },
    previous: { from: prev.fromKey, to: prev.toKey, label: prev.label },
    currency: { code: "AED", label: "AED" },
    attribution: "all_touch",
    totals: {
      ...totalCur,
      prev: totalPrev,
      delta: metricsDelta(totalCur, totalPrev),
    },
    rows,
    benchmarks: {
      medianCostPerViewing: medianCpv,
      medianCostPerWin: medianCpw,
      eligibleSources: eligibleCpv.length,
    },
    callouts,
    atRisk: {
      value: atRiskValue,
      items: overdue.length,
      leads: atRiskLeads.length,
      unvaluedLeads,
      list: atRiskLeads.map((l) => {
        const oldest = l.items[0];
        const daysOverdue = Math.max(
          0,
          Math.floor((now.getTime() - oldest.startsAt.getTime()) / 86400000),
        );
        return {
          leadId: l.leadId,
          leadName: l.leadName,
          stage: l.stage,
          dealValue: l.dealValue,
          sources: l.sources,
          overdueItems: l.items.length,
          oldest: {
            eventId: oldest.id,
            title: oldest.title,
            type: oldest.type,
            startsAt: oldest.startsAt.toISOString(),
            daysOverdue,
          },
        };
      }),
    },
  };
}

export { localKey };
