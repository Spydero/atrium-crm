"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Copy, ListChecks, Merge, X } from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import {
  DuplicatesDialog,
  LeadMergeDialog,
  useDuplicateCount,
} from "@/components/LeadDuplicates";
import { api, formatAed, portalLabel, STAGES, type OrgChannel, type OrgSettings } from "@/lib/api";

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  primarySource: string;
  dealValueAed: number | null;
  listing?: { id: string; title: string; coverUrl?: string | null } | null;
  sources: { source: string; createdAt: string }[];
  assignedTo?: { id?: string; name: string } | null;
};

type Agent = { id: string; name: string; role: string };

function stageTitle(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

type LeadDetail = Lead & {
  notes: { id: string; body: string; createdAt: string; author?: { name: string } | null }[];
  activities: { id: string; type: string; body: string; createdAt: string }[];
  email?: string | null;
  budgetMax?: number | null;
  bedsWanted?: number | null;
  communities?: string[];
};

type Listing = { id: string; title: string };

export default function LeadsPage() {
  const search = useSearchParams();
  const router = useRouter();
  const filterSource = search.get("source");
  const filterStage = search.get("stage");
  const openLeadId = search.get("lead");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<LeadDetail | null>(null);
  const [matches, setMatches] = useState<{ score: number; listing: { id: string; title: string; priceAed: number; community: string } }[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [testingEnabled, setTestingEnabled] = useState(false);
  const [showDemoTools, setShowDemoTools] = useState(false);
  const [channels, setChannels] = useState<OrgChannel[]>([]);

  // Bulk select + duplicates
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<Agent[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[] | null>(null);
  const dupes = useDuplicateCount();

  const load = useCallback(async () => {
    const [l, li] = await Promise.all([
      api<Lead[]>("/api/leads"),
      api<Listing[]>("/api/listings"),
    ]);
    setLeads(l);
    setListings(li);
  }, []);

  useEffect(() => {
    load().catch(console.error);
    api<{ testingEnabled: boolean }>("/api/testing/status")
      .then((s) => setTestingEnabled(s.testingEnabled))
      .catch(() => setTestingEnabled(false));
    api<Agent[]>("/api/leads/agents")
      .then(setAgents)
      .catch(() => setAgents([]));
    api<OrgSettings>("/api/settings")
      .then((s) => setChannels((s.channels || []).filter((c) => c.enabled)))
      .catch(() => setChannels([]));
  }, [load]);

  const enquiryChannels = useMemo(() => {
    const preferred = channels.filter((c) => c.kind === "PORTAL" || c.kind === "ADS");
    const list = preferred.length >= 2 ? preferred : channels.filter((c) => c.key !== "guide");
    return list.slice(0, 6);
  }, [channels]);

  function channelLabel(key: string) {
    return channels.find((c) => c.key === key)?.label || portalLabel(key);
  }

  // Status banner clears itself
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 7000);
    return () => clearTimeout(t);
  }, [msg]);

  // Escape leaves select mode (dialogs handle their own Escape)
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showDuplicates && !mergeIds) exitSelectMode();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectMode, showDuplicates, mergeIds]);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColumn(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const all = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function runBulk(payload: Record<string, unknown>, done: (updated: number, unchanged: number) => string) {
    setBulkBusy(true);
    try {
      const res = await api<{ updated: number; unchanged: number }>("/api/leads/bulk", {
        method: "POST",
        body: JSON.stringify({ ...payload, ids: [...selectedIds] }),
      });
      setMsg(done(res.updated, res.unchanged));
      setSelectedIds(new Set());
      await load();
      if (selected) await openLead(selected.id).catch(() => setSelected(null));
    } catch (e) {
      setMsg(e instanceof Error ? `Bulk action failed: ${e.message}` : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  function plural(n: number) {
    return `${n} ${n === 1 ? "lead" : "leads"}`;
  }

  function bulkStage(stage: string) {
    return runBulk({ action: "stage", stage }, (u, same) =>
      u === 0
        ? `Nothing to change. ${plural(same)} already in ${stageTitle(stage)}.`
        : `Moved ${plural(u)} to ${stageTitle(stage)}${same ? ` (${same} already there)` : ""}.`,
    );
  }

  function bulkAssign(value: string) {
    if (value === "__none") {
      return runBulk({ action: "unassign" }, (u, same) =>
        u === 0 ? "Nothing to change. Already unassigned." : `Unassigned ${plural(u)}${same ? ` (${same} already unassigned)` : ""}.`,
      );
    }
    const agent = agents.find((a) => a.id === value);
    return runBulk({ action: "assign", assignedToId: value }, (u, same) =>
      u === 0
        ? `Nothing to change. Already assigned to ${agent?.name}.`
        : `Assigned ${plural(u)} to ${agent?.name}${same ? ` (${same} already theirs)` : ""}.`,
    );
  }

  async function afterMerge(r: { primaryId: string; merged: number }) {
    setMergeIds(null);
    setShowDuplicates(false);
    exitSelectMode();
    setMsg(`Merged ${plural(r.merged + 1)} into one.`);
    await Promise.all([load(), dupes.refresh()]);
    await openLead(r.primaryId).catch(() => {});
  }

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (filterStage && l.stage !== filterStage) return false;
      if (filterSource) {
        const hit =
          l.primarySource === filterSource ||
          l.sources.some((s) => s.source === filterSource);
        if (!hit) return false;
      }
      return true;
    });
  }, [leads, filterSource, filterStage]);

  const columns = useMemo(() => {
    return STAGES.filter((s) => s !== "LOST").map((stage) => ({
      stage,
      items: filteredLeads.filter((l) => l.stage === stage),
    }));
  }, [filteredLeads]);

  async function openLead(id: string) {
    const detail = await api<LeadDetail>(`/api/leads/${id}`);
    setSelected(detail);
    const m = await api<typeof matches>(`/api/leads/${id}/match`);
    setMatches(m);
  }

  useEffect(() => {
    if (!openLeadId || !leads.length) return;
    openLead(openLeadId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLeadId, leads.length]);

  function clearMoneyFilters() {
    router.push("/app/leads");
  }

  async function moveStage(id: string, stage: string) {
    await api(`/api/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ stage }),
    });
    await load();
    if (selected?.id === id) await openLead(id);
  }

  async function logEnquiry(source: string) {
    const listingId = listings[0]?.id;
    const res = await api<{ fused: boolean; lead: Lead }>("/api/leads/enquiries", {
      method: "POST",
      body: JSON.stringify({
        name: "Khalid Al Mansoori",
        phone: "+971501112233",
        source,
        listingId,
        budgetMax: 2300000,
        bedsWanted: 2,
      }),
    });
    setMsg(
      res.fused
        ? `Fused ${channelLabel(source)} into existing lead.`
        : `New ${channelLabel(source)} lead.`,
    );
    await load();
    await openLead(res.lead.id);
  }

  async function addNote() {
    if (!selected || !note.trim()) return;
    await api(`/api/leads/${selected.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: note }),
    });
    setNote("");
    await openLead(selected.id);
  }

  async function scheduleViewing() {
    if (!selected) return;
    const starts = new Date();
    starts.setDate(starts.getDate() + 2);
    starts.setHours(10, 0, 0, 0);
    await api("/api/calendar", {
      method: "POST",
      body: JSON.stringify({
        title: `Viewing · ${selected.listing?.title || selected.name}`,
        type: "VIEWING",
        startsAt: starts.toISOString(),
        leadId: selected.id,
        listingId: selected.listing?.id,
      }),
    });
    setMsg("Viewing scheduled on calendar.");
    await load();
    await openLead(selected.id);
  }

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">Leads</h1>
          {(filterSource || filterStage) && (
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent"
              onClick={clearMoneyFilters}
              data-testid="money-filter-chip"
            >
              {[
                filterSource ? `Source: ${portalLabel(filterSource)}` : null,
                filterStage ? `Stage: ${stageTitle(filterStage)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              <X size={12} />
            </button>
          )}
          <p className="mt-0.5 text-sm text-muted">
            {filteredLeads.length}
            {(filterSource || filterStage) && filteredLeads.length !== leads.length
              ? ` of ${leads.length}`
              : ""}{" "}
            in pipeline ·{" "}
            {selectMode ? "click cards to select them" : "drag cards to move stages"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${selectMode ? "btn-primary" : "btn-ghost"} inline-flex items-center gap-1.5 text-sm`}
          aria-pressed={selectMode}
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
        >
          <ListChecks size={14} /> {selectMode ? "Done selecting" : "Select"}
        </button>
        <button
          type="button"
          className="btn-ghost inline-flex items-center gap-1.5 text-sm"
          onClick={() => setShowDuplicates(true)}
        >
          <Copy size={14} /> Duplicates
          {dupes.count != null && dupes.count > 0 && (
            <span
              aria-label={`${dupes.count} groups of duplicates`}
              className="rounded-full bg-[var(--mark,#c45c26)] px-1.5 py-px text-[10px] font-bold leading-4 text-white"
            >
              {dupes.count}
            </span>
          )}
        </button>
        <ExportMenu
          items={[
            {
              label: "Leads (CSV)",
              hint: "All leads with stage, source, budget and assignee",
              path: "/api/leads/export.csv",
              fallbackName: "leads.csv",
              kind: "csv",
            },
          ]}
        />
        {testingEnabled && (
          <div className="relative">
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-1.5 text-sm"
              onClick={() => setShowDemoTools((v) => !v)}
            >
              Demo tools
              <ChevronDown size={14} className={showDemoTools ? "rotate-180" : ""} />
            </button>
            {showDemoTools && (
              <div className="absolute right-0 z-20 mt-1.5 w-64 space-y-1.5 rounded-[var(--radius)] border border-line bg-paper p-2 shadow-[0_12px_32px_rgba(16,20,24,0.12)]">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Log enquiry (Lead Fuse)
                </p>
                {enquiryChannels.length === 0 ? (
                  <p className="px-2 text-xs text-muted">Enable a channel in Settings first.</p>
                ) : (
                  enquiryChannels.map((ch, i) => (
                    <button
                      key={ch.key}
                      type="button"
                      onClick={() => {
                        logEnquiry(ch.key);
                        setShowDemoTools(false);
                      }}
                      className="btn-ghost w-full justify-start text-left text-sm"
                    >
                      {i === 0 ? `New ${ch.label} enquiry` : `Same phone via ${ch.label}`}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {msg && (
        <div className="rounded-[var(--radius)] border border-accent/20 bg-accent-soft px-3 py-2.5 text-sm font-medium text-accent">
          {msg}
        </div>
      )}

      <div className="grid gap-3 pb-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {columns.map((col) => (
          <div
            key={col.stage}
            className="surface min-w-0 p-2.5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              const id = e.dataTransfer.getData("text/lead");
              if (id) await moveStage(id, col.stage);
            }}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                {col.stage}
              </span>
              <span className="flex items-center gap-2 text-xs font-semibold text-muted">
                {selectMode && col.items.length > 0 && (
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-accent hover:bg-accent-soft"
                    onClick={() => toggleColumn(col.items.map((l) => l.id))}
                  >
                    {col.items.every((l) => selectedIds.has(l.id)) ? "None" : "All"}
                  </button>
                )}
                {col.items.length}
              </span>
            </div>
            <div className="space-y-2">
              {col.items.map((lead) => {
                const active = !selectMode && selected?.id === lead.id;
                const checked = selectedIds.has(lead.id);
                return (
                  <button
                    key={lead.id}
                    type="button"
                    draggable={!selectMode}
                    data-lead-card={lead.id}
                    aria-pressed={selectMode ? checked : undefined}
                    onDragStart={(e) => e.dataTransfer.setData("text/lead", lead.id)}
                    onClick={() => (selectMode ? toggleSelected(lead.id) : openLead(lead.id))}
                    className={`relative w-full rounded-[8px] border p-3 text-left transition ${
                      active
                        ? "border-ink bg-ink text-white"
                        : checked
                          ? "border-accent bg-accent-soft/50 shadow-[0_0_0_1px_var(--accent)]"
                          : "border-line bg-paper hover:border-ink/25"
                    }`}
                  >
                    {selectMode && (
                      <span
                        aria-hidden
                        className={`absolute right-2.5 top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border ${
                          checked ? "border-accent bg-accent text-white" : "border-ink/30 bg-white"
                        }`}
                      >
                        {checked && <Check size={12} strokeWidth={3} />}
                      </span>
                    )}
                    <div className="pr-6 text-sm font-bold">{lead.name}</div>
                    <div className={`mt-1 text-xs ${active ? "text-white/70" : "text-muted"}`}>
                      {lead.listing?.title || "No listing"}
                      {lead.dealValueAed ? ` · ${formatAed(lead.dealValueAed)}` : ""}
                    </div>
                    <div className={`mt-0.5 text-[11px] ${active ? "text-white/60" : "text-muted/80"}`}>
                      {lead.assignedTo?.name || "Unassigned"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[...new Set(lead.sources.map((s) => s.source))].map((s) => (
                        <span
                          key={s}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            active ? "bg-white/12" : "bg-[#eef1f4] text-muted"
                          }`}
                        >
                          {portalLabel(s)}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="animate-fade grid gap-5 surface p-5 lg:grid-cols-2">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-bold tracking-[-0.03em]">
                  {selected.name}
                </h2>
                <p className="text-sm text-muted">
                  {[selected.phone, selected.email].filter(Boolean).join(" · ") || "no contact"} · {selected.sources.length} sources
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-muted"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => moveStage(selected.id, s)}
                  className={`rounded-[6px] px-2.5 py-1 text-[11px] font-bold ${
                    selected.stage === s ? "bg-accent text-white" : "bg-[#eef1f4] text-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button type="button" onClick={scheduleViewing} className="btn-primary mt-4">
              Schedule viewing
            </button>
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                Notes
              </div>
              <div className="space-y-2">
                {selected.notes.map((n) => (
                  <div key={n.id} className="rounded-[8px] bg-[#eef1f4] px-3 py-2 text-sm">
                    {n.body}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className="field flex-1"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note"
                />
                <button type="button" onClick={addNote} className="btn-ghost">
                  Add
                </button>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                Activity
              </div>
              <ul className="space-y-2 text-sm text-muted">
                {selected.activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-accent/35 pl-3">
                    <span className="font-semibold text-ink">{a.type}</span>
                    <span className="mx-1.5 text-line">|</span>
                    {a.body}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              Smart Match
            </div>
            <div className="space-y-2">
              {matches.slice(0, 5).map((m) => (
                <div
                  key={m.listing.id}
                  className="flex items-center justify-between rounded-[8px] border border-line px-3 py-2.5"
                >
                  <div>
                    <div className="text-sm font-bold">{m.listing.title}</div>
                    <div className="text-xs text-muted">
                      {m.listing.community} · {formatAed(m.listing.priceAed)}
                    </div>
                  </div>
                  <span className="rounded bg-accent-soft px-2 py-1 text-xs font-bold text-accent">
                    {m.score}
                  </span>
                </div>
              ))}
              {!matches.length && (
                <p className="text-sm text-muted">No matches. Add budget or beds on the lead.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {selectMode &&
        createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div
            role="toolbar"
            aria-label="Bulk actions"
            className="surface pointer-events-auto flex flex-wrap items-center gap-2 px-3.5 py-2.5 shadow-[0_16px_40px_rgba(16,20,24,0.22)]"
          >
            <span className="min-w-[88px] text-sm font-bold" aria-live="polite">
              {selectedIds.size} selected
            </span>
            <select
              aria-label="Move to stage"
              className="field py-1.5 text-sm"
              value=""
              disabled={!selectedIds.size || bulkBusy}
              onChange={(e) => e.target.value && bulkStage(e.target.value)}
            >
              <option value="">Move to stage</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {stageTitle(s)}
                </option>
              ))}
            </select>
            <select
              aria-label="Assign to"
              className="field py-1.5 text-sm"
              value=""
              disabled={!selectedIds.size || bulkBusy}
              onChange={(e) => e.target.value && bulkAssign(e.target.value)}
            >
              <option value="">Assign to</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value="__none">Unassigned</option>
            </select>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5 py-1.5 text-sm disabled:opacity-50"
              disabled={selectedIds.size < 2 || selectedIds.size > 10 || bulkBusy}
              title={selectedIds.size > 10 ? "Merge up to 10 leads at a time" : "Merge into one lead"}
              onClick={() => setMergeIds([...selectedIds])}
            >
              <Merge size={14} /> Merge
            </button>
            <button
              type="button"
              className="btn-ghost py-1.5 text-sm"
              disabled={!selectedIds.size || bulkBusy}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
        </div>,
        document.body,
      )}

      {showDuplicates && (
        <DuplicatesDialog onClose={() => setShowDuplicates(false)} onMerged={afterMerge} />
      )}
      {mergeIds && !showDuplicates && (
        <LeadMergeDialog ids={mergeIds} onClose={() => setMergeIds(null)} onMerged={afterMerge} />
      )}
    </div>
  );
}
