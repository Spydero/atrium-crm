"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { BookOpen, Eye, FilePlus2, Download, Plus, Users, X, ArrowUpRight, Search, ArrowDownUp, TrendingUp, TrendingDown } from "lucide-react";
import { api, pct } from "@/lib/api";
import {
  DateRangeFilter,
  dateRangeQuery,
  defaultDateRange,
  type DateRangeValue,
} from "@/components/DateRangeFilter";
import { GuideCover } from "@/components/GuideBits";
import { TrendChart, GUIDES_TREND } from "@/components/TrendChart";
import {
  AUDIENCES,
  AUDIENCE_NAME,
  STATUS_STYLE,
  type AdminGuide,
  type ChannelRow,
  type GuideTotals,
} from "@/components/guideTypes";

type Overview = {
  range: { label: string; days: number };
  filters: { active: boolean; shown: number; total: number };
  totals: GuideTotals;
  previous: GuideTotals;
  channels: ChannelRow[];
  guideLeadShare: { guideLeads: number; allLeads: number };
  guides: AdminGuide[];
};

const SORT_OPTIONS = [
  { id: "status", label: "Status (published first)", dir: "desc" },
  { id: "newest", label: "Newest", dir: "desc" },
  { id: "views", label: "Page views", dir: "desc" },
  { id: "requests", label: "Requests", dir: "desc" },
  { id: "downloads", label: "Downloads", dir: "desc" },
  { id: "conversion", label: "Conversion rate", dir: "desc" },
  { id: "leads", label: "Leads", dir: "desc" },
  { id: "title", label: "Title (A to Z)", dir: "asc" },
] as const;

function Delta({ now, before, days }: { now: number; before: number; days: number }) {
  const diff = now - before;
  const text =
    before === 0
      ? now === 0
        ? "no change"
        : `+${now} (none before)`
      : Math.abs(diff / before) > 9.99
        ? `${diff > 0 ? "over +999%" : "over -999%"}`
        : `${diff > 0 ? "+" : ""}${Math.round((diff / before) * 100)}%`;
  const tone = diff > 0 ? "text-[#15803d]" : diff < 0 ? "text-[#b42318]" : "text-muted";
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <div className={`mt-1.5 flex items-center gap-1 text-[11px] font-bold ${tone}`} data-testid="delta">
      {diff !== 0 && <Icon size={12} />}
      {text}
      <span className="font-medium text-muted">vs previous {days} days</span>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
  children,
}: {
  icon: typeof Eye;
  label: string;
  value: string | number;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="surface px-4 py-3.5" data-testid={`stat-${label}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        <Icon size={13} /> {label}
      </div>
      <div className="font-display mt-1.5 text-[1.75rem] font-bold leading-none tracking-[-0.03em]">{value}</div>
      <div className="mt-1 text-xs text-muted">{note}</div>
      {children}
    </div>
  );
}

function NewGuideDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>("BUYER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const g = await api<AdminGuide>("/api/guides", {
        method: "POST",
        body: JSON.stringify({ title, audience }),
      });
      router.push(`/app/guides/${g.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the guide");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="animate-fade fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[14vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New guide"
        onSubmit={create}
        className="surface w-full max-w-md space-y-4 p-6 shadow-[0_24px_60px_rgba(16,20,24,0.25)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-bold tracking-[-0.03em]">New guide</h2>
            <p className="mt-0.5 text-sm text-muted">You can add the PDF and details on the next screen.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Title</span>
          <input
            className="field w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The First-Time Buyer's Guide"
            autoFocus
            required
            minLength={3}
          />
        </label>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Written for</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {AUDIENCES.map((a) => (
              <button
                key={a}
                type="button"
                data-on={audience === a}
                className="filter-chip"
                onClick={() => setAudience(a)}
              >
                {AUDIENCE_NAME[a]}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || title.trim().length < 3}>
            {busy ? "Creating…" : "Create draft"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export default function GuidesPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => defaultDateRange("30d"));
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [audience, setAudience] = useState("ALL");
  const [access, setAccess] = useState("ALL");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["id"]>("status");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  // Wait a moment after typing before asking the server
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "ALL") p.set("status", status);
    if (audience !== "ALL") p.set("audience", audience);
    if (access !== "ALL") p.set("access", access);
    return p.toString();
  }, [q, status, audience, access]);

  const rangeKey = dateRangeQuery(dateRange);
  const listQuery = `${rangeKey}${filterQuery ? `&${filterQuery}` : ""}&sort=${sort}&dir=${dir}`;

  const load = useCallback(async (query: string) => {
    try {
      setData(await api<Overview>(`/api/guides?${query}`));
      setError("");
    } catch (e) {
      if (e instanceof Error && /session expired/i.test(e.message)) return;
      setError(e instanceof Error ? e.message : "Failed to load guides");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(listQuery);
  }, [listQuery, load]);

  function clearFilters() {
    setSearch("");
    setQ("");
    setStatus("ALL");
    setAudience("ALL");
    setAccess("ALL");
  }

  const t = data?.totals;
  const prev = data?.previous;
  const share = data?.guideLeadShare;
  const days = data?.range.days ?? 30;
  const maxChannel = Math.max(1, ...(data?.channels.map((c) => c.requests) ?? [1]));
  const totalChannel = data?.channels.reduce((a, c) => a + c.requests, 0) ?? 0;
  const filtersOn = !!data?.filters.active;

  return (
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Marketing</div>
          <h1 className="font-display mt-1 text-[1.75rem] font-bold tracking-[-0.04em]">Guides</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Downloadable guides that turn visitors into leads. Share a link, and every request lands in Leads with
            its source.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => setCreating(true)}>
            <Plus size={15} /> New guide
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {t && prev && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat icon={Eye} label="Page views" value={t.views} note={`${t.gatedViews} form first · ${t.openViews} open`}>
            <Delta now={t.views} before={prev.views} days={days} />
          </Stat>
          <Stat
            icon={FilePlus2}
            label="Requests"
            value={t.requests}
            note={t.gatedViews > 0 ? `${pct(t.requestRate)} of form-first views` : "no form-first views"}
          >
            <Delta now={t.requests} before={prev.requests} days={days} />
          </Stat>
          <Stat
            icon={Download}
            label="Downloads"
            value={t.newDownloads}
            note={`${t.openDownloads} open · ${pct(t.downloadRate)} of requests opened`}
          >
            <Delta now={t.newDownloads} before={prev.newDownloads} days={days} />
          </Stat>
          <Stat
            icon={Users}
            label="Guide leads"
            value={filtersOn ? t.leads : (share?.guideLeads ?? 0)}
            note={filtersOn ? "leads from these guides" : `of ${share?.allLeads ?? 0} new leads`}
          >
            <Delta now={t.leads} before={prev.leads} days={days} />
          </Stat>
          <Stat icon={ArrowUpRight} label="Reached viewing" value={t.reachedViewing} note={`${t.won} won`}>
            <Delta now={t.reachedViewing} before={prev.reachedViewing} days={days} />
          </Stat>
        </div>
      )}

      <TrendChart
        range={dateRange}
        onRangeChange={setDateRange}
        config={GUIDES_TREND}
        extraQuery={filterQuery}
      />

      <div className="surface flex flex-wrap items-center gap-2 p-3" data-testid="guide-filters">
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="field w-full pl-8"
            placeholder="Search guides"
            aria-label="Search guides"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select className="field" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select className="field" aria-label="Audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="ALL">All audiences</option>
          {AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {AUDIENCE_NAME[a]}
            </option>
          ))}
        </select>
        <select className="field" aria-label="Access" value={access} onChange={(e) => setAccess(e.target.value)}>
          <option value="ALL">Form first and open</option>
          <option value="gated">Form first</option>
          <option value="open">Open download</option>
        </select>
        <div className="flex items-center gap-1">
          <select
            className="field"
            aria-label="Sort guides by"
            value={sort}
            onChange={(e) => {
              const next = SORT_OPTIONS.find((o) => o.id === e.target.value)!;
              setSort(next.id);
              setDir(next.dir);
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1 px-2.5"
            aria-label={`Sort direction: ${dir === "desc" ? "high to low" : "low to high"}`}
            title="Flip the sort direction"
            disabled={sort === "status"}
            onClick={() => setDir(dir === "desc" ? "asc" : "desc")}
          >
            <ArrowDownUp size={14} />
            <span className="text-xs font-bold">{dir === "desc" ? "High to low" : "Low to high"}</span>
          </button>
        </div>
        {filtersOn && (
          <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={clearFilters}>
            Clear filters
          </button>
        )}
        <div className="ml-auto text-xs text-muted" data-testid="guide-count">
          {data ? `Showing ${data.filters.shown} of ${data.filters.total} guides` : ""}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {data && data.guides.length === 0 && (
            <div className="surface flex flex-col items-center gap-3 p-10 text-center">
              <BookOpen size={28} className="text-muted" />
              {filtersOn ? (
                <div>
                  <div className="font-bold">No guides match these filters</div>
                  <button type="button" className="mt-2 text-sm font-semibold text-accent hover:underline" onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="font-bold">No guides yet</div>
                    <p className="text-sm text-muted">Create your first guide, upload a PDF and publish it.</p>
                  </div>
                  <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                    New guide
                  </button>
                </>
              )}
            </div>
          )}
          {data?.guides.map((g) => (
            <Link
              key={g.id}
              href={`/app/guides/${g.id}`}
              data-testid="guide-card"
              className="surface flex gap-4 p-4 transition hover:border-accent/50"
            >
              <div className="w-[68px] shrink-0">
                <GuideCover title={g.title} org="" audience={g.audience} coverUrl={g.coverUrl} size="xs" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[15px] font-bold">{g.title}</h2>
                  <span className={`status-chip ${STATUS_STYLE[g.status]}`}>{g.status}</span>
                  <span className="status-chip bg-[#eef1f4] text-muted">{AUDIENCE_NAME[g.audience]}</span>
                  <span className="status-chip bg-[#eef1f4] text-muted">{g.gated ? "Form first" : "Open download"}</span>
                </div>
                <p className="mt-1 line-clamp-1 text-sm text-muted">{g.summary || "No summary yet"}</p>
                {!g.hasFile && g.status !== "ARCHIVED" && (
                  <p className="mt-1 text-xs font-semibold text-[var(--warn)]">PDF not uploaded yet</p>
                )}
                <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                  <span>
                    <b className="text-ink">{g.stats?.views ?? 0}</b> views
                  </span>
                  {g.gated && (
                    <span>
                      <b className="text-ink">{g.stats?.requests ?? 0}</b> requests
                    </span>
                  )}
                  <span>
                    <b className="text-ink">{g.stats?.newDownloads ?? 0}</b> downloads
                  </span>
                  <span title={g.gated ? "Requests divided by page views" : "Downloads divided by page views"}>
                    <b className="text-ink">{pct(g.stats?.conversionRate ?? 0)}</b>{" "}
                    {g.gated ? "request rate" : "download rate"}
                  </span>
                  {(g.stats?.leads ?? 0) > 0 && (
                    <span>
                      <b className="text-ink">{g.stats?.leads}</b> leads
                    </span>
                  )}
                  {g.owner && <span>Owner {g.owner.name}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <aside className="surface h-fit p-4" data-testid="channels">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Requests by channel</div>
          <p className="mb-3 mt-0.5 text-xs text-muted">
            {data?.range.label}
            {totalChannel > 0 ? ` · ${totalChannel} requests` : ""}
          </p>
          {data && data.channels.length === 0 && <p className="text-sm text-muted">No requests in this period.</p>}
          <ul className="space-y-3">
            {data?.channels.map((c) => (
              <li key={c.channel}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{c.channel}</span>
                  <span>
                    <b>{c.requests}</b>
                    <span className="ml-1 text-xs text-muted">{pct(totalChannel ? c.requests / totalChannel : 0)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[#eef1f4]">
                  <div
                    className="h-1.5 rounded-full bg-accent"
                    style={{ width: `${Math.max(4, (c.requests / maxChannel) * 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {c.requests ? pct(c.downloaded / c.requests) : "0%"} downloaded · {c.leads} leads · {c.reachedViewing}{" "}
                  reached viewing
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {creating && <NewGuideDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
