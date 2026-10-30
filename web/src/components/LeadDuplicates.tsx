"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, Merge, X } from "lucide-react";
import { api, formatAed, portalLabel } from "@/lib/api";

export type LeadSummary = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  stage: string;
  primarySource: string;
  sources: string[];
  sourcesCount: number;
  notesCount: number;
  eventsCount: number;
  activitiesCount: number;
  listing: { id: string; title: string } | null;
  assignedTo: { id: string; name: string } | null;
  budgetMin: number | null;
  budgetMax: number | null;
  bedsWanted: number | null;
  dealValueAed: number | null;
  createdAt: string;
};

type DuplicateGroup = {
  key: string;
  reasons: ("phone" | "email")[];
  suggestedPrimaryId: string;
  leads: LeadSummary[];
};

type DuplicatesResponse = { count: number; leadCount: number; groups: DuplicateGroup[] };

function reasonLabel(reasons: string[]) {
  if (reasons.includes("phone") && reasons.includes("email")) return "Same phone and email";
  if (reasons.includes("phone")) return "Same phone number";
  return "Same email";
}

function stageLabel(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Overlay({
  onClose,
  label,
  children,
  wide,
}: {
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal to <body>: page wrappers keep a CSS transform after their entrance
  // animation, which would otherwise turn `fixed` into container-relative.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`surface animate-fade flex max-h-[90vh] w-full flex-col ${
          wide ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-line/70 py-1.5 text-[13px]">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right font-medium text-ink">{children}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Merge dialog: compare 2..10 leads, pick the one to keep                */
/* ---------------------------------------------------------------------- */

export function LeadMergeDialog({
  ids,
  onClose,
  onMerged,
}: {
  ids: string[];
  onClose: () => void;
  onMerged: (result: { primaryId: string; merged: number }) => void;
}) {
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [suggested, setSuggested] = useState("");
  const [primaryId, setPrimaryId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ suggestedPrimaryId: string; leads: LeadSummary[] }>(
      `/api/leads/compare?ids=${ids.join(",")}`,
    )
      .then((r) => {
        if (!alive) return;
        setLeads(r.leads);
        setSuggested(r.suggestedPrimaryId);
        setPrimaryId(r.suggestedPrimaryId);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load leads"));
    return () => {
      alive = false;
    };
  }, [ids]);

  const primary = leads?.find((l) => l.id === primaryId);
  const others = leads?.filter((l) => l.id !== primaryId) ?? [];
  const totalSources = leads?.reduce((s, l) => s + l.sourcesCount, 0) ?? 0;
  const totalNotes = leads?.reduce((s, l) => s + l.notesCount, 0) ?? 0;

  async function confirm() {
    if (!primary) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ merged: number }>("/api/leads/merge", {
        method: "POST",
        body: JSON.stringify({
          primaryId: primary.id,
          duplicateIds: others.map((o) => o.id),
        }),
      });
      onMerged({ primaryId: primary.id, merged: r.merged });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} label="Merge leads" wide>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h3 className="font-display text-lg font-bold tracking-[-0.02em]">Merge leads</h3>
          <p className="mt-0.5 text-sm text-muted">
            Choose the lead to keep. Sources, notes, activity and calendar events from the others
            move onto it, and any blank fields are filled in.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-1 text-muted hover:bg-line/50"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {!leads && !error && (
          <div className="flex items-center gap-2 py-10 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading leads
          </div>
        )}
        {leads && (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${leads.length}, minmax(220px, 1fr))` }}
          >
            {leads.map((l) => {
              const keep = l.id === primaryId;
              return (
                <label
                  key={l.id}
                  className={`block cursor-pointer rounded-[10px] border p-3.5 transition ${
                    keep
                      ? "border-accent bg-accent-soft/40 shadow-[0_0_0_1px_var(--accent)]"
                      : "border-line bg-paper hover:border-ink/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                      <input
                        type="radio"
                        name="keep-lead"
                        checked={keep}
                        onChange={() => setPrimaryId(l.id)}
                        className="accent-[var(--accent)]"
                      />
                      {keep ? "Keep this lead" : "Merge into kept lead"}
                    </span>
                    {l.id === suggested && (
                      <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">
                        Suggested
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 text-base font-bold">{l.name}</div>
                  <div className="text-sm text-muted">{l.phone}</div>
                  <div className="mb-2 truncate text-sm text-muted">{l.email || "No email"}</div>

                  <Row label="Stage">{stageLabel(l.stage)}</Row>
                  <Row label="Sources">
                    <span className="flex flex-wrap justify-end gap-1">
                      {l.sources.map((s) => (
                        <span key={s} className="rounded bg-[#eef1f4] px-1.5 py-0.5 text-[11px] font-bold text-muted">
                          {portalLabel(s)}
                        </span>
                      ))}
                    </span>
                  </Row>
                  <Row label="Listing">{l.listing?.title || "None"}</Row>
                  <Row label="Assigned to">{l.assignedTo?.name || "Unassigned"}</Row>
                  <Row label="Budget">{l.budgetMax ? `up to ${formatAed(l.budgetMax)}` : "Not set"}</Row>
                  <Row label="Deal value">{l.dealValueAed ? formatAed(l.dealValueAed) : "Not set"}</Row>
                  <Row label="History">
                    {l.notesCount} {l.notesCount === 1 ? "note" : "notes"}, {l.eventsCount}{" "}
                    {l.eventsCount === 1 ? "event" : "events"}
                  </Row>
                  <Row label="Created">{dateLabel(l.createdAt)}</Row>
                </label>
              );
            })}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
        <p className="max-w-xl text-xs text-muted">
          {primary ? (
            <>
              Result: <b className="text-ink">{primary.name}</b> with {totalSources} sources and{" "}
              {totalNotes} notes. {others.length} {others.length === 1 ? "lead" : "leads"} will be
              removed. This cannot be undone.
            </>
          ) : (
            "Select a lead to keep."
          )}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-60"
            onClick={confirm}
            disabled={!primary || busy || !others.length}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
            Merge {others.length > 0 ? `${others.length + 1} leads` : ""}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ---------------------------------------------------------------------- */
/* Duplicates review                                                      */
/* ---------------------------------------------------------------------- */

export function useDuplicateCount() {
  const [count, setCount] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await api<DuplicatesResponse>("/api/leads/duplicates");
      setCount(r.count);
    } catch {
      setCount(null);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { count, refresh };
}

export function DuplicatesDialog({
  onClose,
  onMerged,
}: {
  onClose: () => void;
  onMerged: (result: { primaryId: string; merged: number }) => void;
}) {
  const [data, setData] = useState<DuplicatesResponse | null>(null);
  const [error, setError] = useState("");
  const [mergeIds, setMergeIds] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<DuplicatesResponse>("/api/leads/duplicates"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load duplicates");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Overlay onClose={onClose} label="Review duplicates">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-bold tracking-[-0.02em]">Review duplicates</h3>
            <p className="mt-0.5 text-sm text-muted">
              Leads sharing a phone number (any format) or email address.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-line/50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
          {!data && !error && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" /> Scanning leads
            </div>
          )}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {data && data.groups.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 size={28} className="text-[var(--ok,#15803d)]" />
              <p className="font-semibold">No duplicates found</p>
              <p className="text-sm text-muted">Every lead has a unique phone number and email.</p>
            </div>
          )}
          {data?.groups.map((g) => (
            <div key={g.key} className="rounded-[10px] border border-line">
              <div className="flex items-center justify-between gap-2 border-b border-line bg-[#f5f6f8] px-3.5 py-2">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                  {reasonLabel(g.reasons)} · {g.leads.length} leads
                </span>
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 text-xs"
                  onClick={() => setMergeIds(g.leads.map((l) => l.id))}
                >
                  Review and merge
                </button>
              </div>
              <ul className="divide-y divide-line/70">
                {g.leads.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <span className="font-bold">{l.name}</span>
                      {l.id === g.suggestedPrimaryId && (
                        <span className="ml-2 rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">
                          Suggested to keep
                        </span>
                      )}
                      <div className="text-xs text-muted">
                        {l.phone} · {l.email || "no email"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="rounded bg-[#eef1f4] px-1.5 py-0.5 font-bold">{stageLabel(l.stage)}</span>
                      {l.sources.map((s) => (
                        <span key={s} className="rounded bg-[#eef1f4] px-1.5 py-0.5 font-bold">
                          {portalLabel(s)}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Overlay>

      {mergeIds && (
        <LeadMergeDialog
          ids={mergeIds}
          onClose={() => setMergeIds(null)}
          onMerged={(r) => {
            setMergeIds(null);
            onMerged(r);
            load();
          }}
        />
      )}
    </>
  );
}
