"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { BookOpen, Eye, FilePlus2, Download, Plus, Users, X, ArrowUpRight } from "lucide-react";
import { api, pct } from "@/lib/api";
import {
  DateRangeFilter,
  dateRangeQuery,
  defaultDateRange,
  type DateRangeValue,
} from "@/components/DateRangeFilter";
import { GuideCover } from "@/components/GuideBits";
import { AUDIENCES, AUDIENCE_NAME, STATUS_STYLE, type AdminGuide, type GuideStats } from "@/components/guideTypes";

type Overview = {
  range: { label: string };
  totals: GuideStats;
  channels: { channel: string; requests: number }[];
  guideLeadShare: { guideLeads: number; allLeads: number };
  guides: AdminGuide[];
};

function Stat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Eye;
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="surface px-4 py-3.5" data-testid={`stat-${label}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        <Icon size={13} /> {label}
      </div>
      <div className="font-display mt-1.5 text-[1.75rem] font-bold leading-none tracking-[-0.03em]">{value}</div>
      <div className="mt-1 text-xs text-muted">{note}</div>
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

  const load = useCallback(async (range: DateRangeValue) => {
    try {
      setData(await api<Overview>(`/api/guides?${dateRangeQuery(range)}`));
      setError("");
    } catch (e) {
      if (e instanceof Error && /session expired/i.test(e.message)) return;
      setError(e instanceof Error ? e.message : "Failed to load guides");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(dateRange);
  }, [dateRange, load]);

  const t = data?.totals;
  const share = data?.guideLeadShare;
  const maxChannel = Math.max(1, ...(data?.channels.map((c) => c.requests) ?? [1]));

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

      {t && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat icon={Eye} label="Page views" value={t.views} note="guide pages opened" />
          <Stat icon={FilePlus2} label="Requests" value={t.requests} note={`${pct(t.requestRate)} of views`} />
          <Stat icon={Download} label="Downloads" value={t.totalDownloads} note={`${pct(t.downloadRate)} of requests opened`} />
          <Stat
            icon={Users}
            label="New guide leads"
            value={share?.guideLeads ?? 0}
            note={`of ${share?.allLeads ?? 0} new leads`}
          />
          <Stat icon={ArrowUpRight} label="Reached viewing" value={t.reachedViewing} note={`${t.won} won`} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {data && data.guides.length === 0 && (
            <div className="surface flex flex-col items-center gap-3 p-10 text-center">
              <BookOpen size={28} className="text-muted" />
              <div>
                <div className="font-bold">No guides yet</div>
                <p className="text-sm text-muted">Create your first guide, upload a PDF and publish it.</p>
              </div>
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                New guide
              </button>
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
                  <span>
                    <b className="text-ink">{g.stats?.requests ?? 0}</b> requests
                  </span>
                  <span>
                    <b className="text-ink">{g.stats?.totalDownloads ?? 0}</b> downloads
                  </span>
                  <span>
                    <b className="text-ink">{pct(g.stats?.requestRate ?? 0)}</b> request rate
                  </span>
                  {g.owner && <span>Owner {g.owner.name}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <aside className="surface h-fit p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Requests by channel</div>
          <p className="mb-3 mt-0.5 text-xs text-muted">{data?.range.label}</p>
          {data && data.channels.length === 0 && <p className="text-sm text-muted">No requests in this period.</p>}
          <ul className="space-y-2.5">
            {data?.channels.map((c) => (
              <li key={c.channel}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="truncate font-semibold">{c.channel}</span>
                  <b>{c.requests}</b>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[#eef1f4]">
                  <div
                    className="h-1.5 rounded-full bg-accent"
                    style={{ width: `${Math.max(4, (c.requests / maxChannel) * 100)}%` }}
                  />
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
