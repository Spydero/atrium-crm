"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Check, ChevronDown, Copy, ListChecks, Merge, X } from "lucide-react";
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
  createdAt?: string;
  wonAt?: string | null;
  lostAt?: string | null;
  updatedAt?: string;
  listing?: { id: string; title: string; coverUrl?: string | null } | null;
  sources: { id: string; source: string; createdAt: string; removable?: boolean }[];
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
  const filterSlice = search.get("slice"); // open | won | lost | closed
  const createdFrom = search.get("createdFrom");
  const createdTo = search.get("createdTo");
  const wonFrom = search.get("wonFrom");
  const wonTo = search.get("wonTo");
  const lostFrom = search.get("lostFrom");
  const lostTo = search.get("lostTo");
  const openLeadId = search.get("lead");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<LeadDetail | null>(null);
  const [matches, setMatches] = useState<{ score: number; listing: { id: string; title: string; priceAed: number; community: string } }[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [removingEnquiry, setRemovingEnquiry] = useState(false);
  const [enquiryError, setEnquiryError] = useState("");
  const [undoEnquiry, setUndoEnquiry] = useState<{ leadId: string; sourceId: string } | null>(null);
  const [showDemoTools, setShowDemoTools] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    phone: "",
    email: "",
    primarySource: "manual",
    listingId: "",
    budgetMax: "",
    bedsWanted: "",
  });
  const [channels, setChannels] = useState<OrgChannel[]>([]);

  // Bulk select + duplicates
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<Agent[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[] | null>(null);
  const [showLost, setShowLost] = useState(false);
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
    api<{ demoMode: boolean }>("/api/testing/status")
      .then((s) => setDemoMode(s.demoMode))
      .catch(() => setDemoMode(false));
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
      if (e.key === "Escape" && !showDuplicates && !mergeIds && !showAddLead) exitSelectMode();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectMode, showDuplicates, mergeIds, showAddLead]);

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
    function dayKey(iso?: string | null) {
      if (!iso) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    function inDayRange(iso: string | null | undefined, from: string | null, to: string | null) {
      if (!from && !to) return true;
      const key = dayKey(iso);
      if (!key) return false;
      if (from && key < from) return false;
      if (to && key > to) return false;
      return true;
    }

    return leads.filter((l) => {
      if (filterSlice === "won" && l.stage !== "WON") return false;
      if (filterSlice === "lost" && l.stage !== "LOST") return false;
      if (filterSlice === "closed" && l.stage !== "WON" && l.stage !== "LOST") return false;
      if (filterSlice === "open" && (l.stage === "WON" || l.stage === "LOST")) return false;
      if (filterStage && l.stage !== filterStage) return false;
      if (filterSource) {
        const hit =
          l.primarySource === filterSource ||
          l.sources.some((s) => s.source === filterSource);
        if (!hit) return false;
      }
      if (createdFrom || createdTo) {
        if (!inDayRange(l.createdAt, createdFrom, createdTo)) return false;
      }
      if (wonFrom || wonTo) {
        if (l.stage !== "WON") return false;
        if (!inDayRange(l.wonAt || l.updatedAt, wonFrom, wonTo)) return false;
      }
      if (lostFrom || lostTo) {
        if (l.stage !== "LOST") return false;
        if (!inDayRange(l.lostAt || l.updatedAt, lostFrom, lostTo)) return false;
      }
      return true;
    });
  }, [
    leads,
    filterSource,
    filterStage,
    filterSlice,
    createdFrom,
    createdTo,
    wonFrom,
    wonTo,
    lostFrom,
    lostTo,
  ]);

  const columns = useMemo(() => {
    const hideLostCol = filterSlice !== "lost" && filterSlice !== "closed";
    return STAGES.filter((s) => (hideLostCol ? s !== "LOST" : true))
      .filter((s) => {
        if (filterSlice === "won") return s === "WON";
        if (filterSlice === "lost") return s === "LOST";
        if (filterSlice === "open") return s !== "WON" && s !== "LOST";
        return true;
      })
      .map((stage) => ({
        stage,
        items: filteredLeads.filter((l) => l.stage === stage),
      }));
  }, [filteredLeads, filterSlice]);

  const lostLeads = useMemo(() => filteredLeads.filter((l) => l.stage === "LOST"), [filteredLeads]);
  const pipelineCount = filteredLeads.filter((l) => l.stage !== "LOST" && l.stage !== "WON").length;
  const pipelineTotal = leads.filter((l) => l.stage !== "LOST" && l.stage !== "WON").length;
  /** Lost strip only when LOST is not already a board column (won/lost/closed slices). */
  const lostInColumns = filterSlice === "lost" || filterSlice === "closed";
  const lostVisible = lostInColumns ? false : showLost || filterStage === "LOST";

  function hideLost() {
    setShowLost(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const l of lostLeads) next.delete(l.id);
      return next;
    });
  }

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

  useEffect(() => {
    if (search.get("add") === "1") setShowAddLead(true);
  }, [search]);

  useEffect(() => {
    if (!channels.length) return;
    setAddForm((f) => {
      if (channels.some((c) => c.key === f.primarySource)) return f;
      const manual = channels.find((c) => c.key === "manual");
      return { ...f, primarySource: manual?.key || channels[0].key };
    });
  }, [channels]);

  function clearMoneyFilters() {
    router.push("/app/leads");
  }

  function openAddLead() {
    setAddError("");
    setShowAddLead(true);
  }

  function closeAddLead() {
    setShowAddLead(false);
    setAddError("");
    if (search.get("add") === "1") router.replace("/app/leads");
  }

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    try {
      const res = await api<{ fused: boolean; lead: Lead }>("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          name: addForm.name.trim(),
          phone: addForm.phone.trim(),
          email: addForm.email.trim() || null,
          primarySource: addForm.primarySource || "manual",
          listingId: addForm.listingId || null,
          budgetMax: addForm.budgetMax ? Number(addForm.budgetMax) : null,
          bedsWanted: addForm.bedsWanted ? Number(addForm.bedsWanted) : null,
        }),
      });
      setMsg(
        res.fused
          ? `Same phone — merged into ${res.lead.name}.`
          : `Lead ${res.lead.name} added.`,
      );
      setAddForm({
        name: "",
        phone: "",
        email: "",
        primarySource: channels.find((c) => c.key === "manual")?.key || channels[0]?.key || "manual",
        listingId: "",
        budgetMax: "",
        bedsWanted: "",
      });
      closeAddLead();
      await load();
      await openLead(res.lead.id);
    } catch (err) {
      if (err instanceof Error && /session expired|unauthorized/i.test(err.message)) return;
      setAddError(err instanceof Error ? err.message : "Could not add lead");
    } finally {
      setAdding(false);
    }
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
    if (demoBusy) return;
    setDemoBusy(true);
    setEnquiryError("");
    setUndoEnquiry(null);
    try {
      const result = await api<{ fused: boolean; lead: Lead; enquiryId?: string }>("/api/leads/demo-enquiries", {
        method: "POST",
        body: JSON.stringify({ source, listingId: listings[0]?.id }),
      });
      setMsg(result.fused ? `Added a sample ${channelLabel(source)} enquiry.` : `Created a sample ${channelLabel(source)} lead.`);
      if (result.enquiryId) setUndoEnquiry({ leadId: result.lead.id, sourceId: result.enquiryId });
      await load();
      await openLead(result.lead.id);
    } catch (error) {
      setEnquiryError(error instanceof Error ? error.message : "Could not log the sample enquiry.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function removeEnquiry(leadId: string, sourceId: string) {
    if (removingEnquiry) return;
    setRemovingEnquiry(true);
    setEnquiryError("");
    try {
      await api(`/api/leads/${leadId}/enquiries/${sourceId}`, { method: "DELETE" });
      setUndoEnquiry(current => current?.sourceId === sourceId ? null : current);
      setMsg("Enquiry removed.");
      await load();
      if (selected?.id === leadId) await openLead(leadId);
    } catch (error) {
      setEnquiryError(error instanceof Error ? error.message : "Could not remove the enquiry.");
    } finally {
      setRemovingEnquiry(false);
    }
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

  function renderColumn(
    col: { stage: string; items: Lead[] },
    opts: { className?: string; itemsClassName?: string; extra?: React.ReactNode } = {},
  ) {
    return (
      <div
        key={col.stage}
        className={`surface min-w-0 p-2.5 ${opts.className ?? ""}`}
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
            {opts.extra}
          </span>
        </div>
        <div className={opts.itemsClassName ?? "space-y-2"}>
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
    );
  }

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">Leads</h1>
          {(filterSource || filterStage || filterSlice || createdFrom || wonFrom || lostFrom) && (
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent"
              onClick={clearMoneyFilters}
              data-testid="money-filter-chip"
            >
              {[
                filterSlice ? `Slice: ${filterSlice}` : null,
                filterSource ? `Source: ${portalLabel(filterSource)}` : null,
                filterStage ? `Stage: ${stageTitle(filterStage)}` : null,
                createdFrom || createdTo ? "Created in range" : null,
                wonFrom || wonTo ? "Won in range" : null,
                lostFrom || lostTo ? "Lost in range" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              <X size={12} />
            </button>
          )}
          <p className="mt-0.5 text-sm text-muted">
            {filterSlice === "closed" || filterSlice === "won" || filterSlice === "lost"
              ? `${filteredLeads.length} ${filterSlice === "won" ? "won" : filterSlice === "lost" ? "lost" : "closed"}`
              : `${pipelineCount}${
                  (filterSource || filterStage || filterSlice) && pipelineCount !== pipelineTotal
                    ? ` of ${pipelineTotal}`
                    : ""
                } in pipeline`}
            {" · "}
            {selectMode ? "click cards to select them" : "drag cards to move stages"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary text-sm" onClick={openAddLead}>
          Add lead
        </button>
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
        {lostLeads.length > 0 && filterStage !== "LOST" && !lostInColumns && (
          <button
            type="button"
            className={`${showLost ? "btn-primary" : "btn-ghost"} inline-flex items-center gap-1.5 text-sm`}
            aria-pressed={showLost}
            aria-controls="lost-strip"
            onClick={() => (showLost ? hideLost() : setShowLost(true))}
            data-testid="toggle-lost"
          >
            <Archive size={14} /> Lost
            <span
              aria-label={`${lostLeads.length} lost leads`}
              className={`rounded-full px-1.5 py-px text-[10px] font-bold leading-4 ${
                showLost ? "bg-white/20 text-white" : "bg-[#eef1f4] text-muted"
              }`}
            >
              {lostLeads.length}
            </span>
          </button>
        )}
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
        {demoMode && (
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
                  enquiryChannels.map((ch) => (
                    <button
                      key={ch.key}
                      type="button"
                      disabled={demoBusy}
                      onClick={() => {
                        void logEnquiry(ch.key);
                        setShowDemoTools(false);
                      }}
                      className="btn-ghost w-full justify-start text-left text-sm"
                    >
                      { `Sample enquiry via ${ch.label}` }
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {enquiryError && <p role="alert" className="text-sm text-[var(--danger)]">{enquiryError}</p>}
      {(msg || undoEnquiry) && (
        <div className="rounded-[var(--radius)] border border-accent/20 bg-accent-soft px-3 py-2.5 text-sm font-medium text-accent">
          <span role="status">{msg || "Sample enquiry added."}</span>
          {undoEnquiry && (
            <button type="button" className="ml-3 underline" disabled={removingEnquiry}
              onClick={() => void removeEnquiry(undoEnquiry.leadId, undoEnquiry.sourceId)}>Undo</button>
          )}
        </div>
      )}

      {leads.length === 0 && !filterSource && !filterStage && (
        <div className="surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">No leads yet</p>
            <p className="mt-0.5 text-sm text-muted">
              A listing does not create a lead. Log a walk-in, call, WhatsApp, or referral.
            </p>
          </div>
          <button type="button" className="btn-primary shrink-0 text-sm" onClick={openAddLead}>
            Add lead
          </button>
        </div>
      )}

      {pipelineCount === 0 && lostLeads.length > 0 && !lostVisible && (
        <div className="surface flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="lost-empty-state">
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">No open leads</span> — {lostLeads.length} marked lost
          </p>
          <button
            type="button"
            className="btn-ghost inline-flex shrink-0 items-center gap-1.5 text-sm"
            onClick={() => setShowLost(true)}
          >
            <Archive size={14} /> Show lost
          </button>
        </div>
      )}

      {lostVisible && (
        <div id="lost-strip" data-testid="lost-column">
          {renderColumn(
            { stage: "LOST", items: lostLeads },
            {
              className: "max-h-[19rem] overflow-y-auto",
              itemsClassName: "grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5",
              extra:
                filterStage !== "LOST" ? (
                  <button
                    type="button"
                    className="btn-ghost p-1"
                    aria-label="Hide lost leads"
                    onClick={hideLost}
                  >
                    <X size={14} />
                  </button>
                ) : null,
            },
          )}
        </div>
      )}

      <div className="grid gap-3 pb-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {columns.map((col) => renderColumn(col))}
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
            <Link className="btn-ghost mt-3" href={`/app/messages?tab=client&lead=${encodeURIComponent(selected.id)}`}>
              Client chat
            </Link>
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
            {selected.sources.length > 0 && (
              <section className="mt-5" aria-label="Enquiries">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Enquiries</h3>
                <ul className="space-y-1">
                  {selected.sources.map(source => (
                    <li key={source.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{channelLabel(source.source)} · <time dateTime={source.createdAt}>{new Date(source.createdAt).toLocaleString()}</time></span>
                      {source.removable && (
                        <button type="button" className="btn-ghost" disabled={removingEnquiry}
                          aria-label={`Remove ${channelLabel(source.source)} enquiry`}
                          onClick={() => {
                            if (window.confirm(`Remove this ${channelLabel(source.source)} enquiry from the lead and source reports?`)) {
                              void removeEnquiry(selected.id, source.id);
                            }
                          }}>Remove</button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
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
        <div className="pointer-events-none fixed bottom-5 left-[212px] right-0 z-50 flex justify-center px-4">
          <div
            role="toolbar"
            aria-label="Bulk actions"
            className="surface pointer-events-auto flex w-max max-w-full flex-wrap items-center justify-center gap-2 px-3.5 py-2.5 shadow-[0_16px_40px_rgba(16,20,24,0.22)]"
          >
            <span className="shrink-0 text-sm font-bold tabular-nums" aria-live="polite">
              {selectedIds.size} selected
            </span>
            <select
              aria-label="Move to stage"
              className="field py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
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
              className="field py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
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
              className={`inline-flex shrink-0 items-center gap-1.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 ${
                selectedIds.size >= 2 && selectedIds.size <= 10 ? "btn-primary" : "btn-ghost"
              }`}
              disabled={selectedIds.size < 2 || selectedIds.size > 10 || bulkBusy}
              title={
                selectedIds.size < 2
                  ? "Select 2–10 leads to merge"
                  : selectedIds.size > 10
                    ? "Merge up to 10 leads at a time"
                    : "Merge into one lead"
              }
              onClick={() => setMergeIds([...selectedIds])}
            >
              <Merge size={14} aria-hidden /> Merge
            </button>
            <button
              type="button"
              className="btn-ghost shrink-0 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
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

      {showAddLead &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="animate-fade fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeAddLead();
            }}
            role="presentation"
          >
            <form
              onSubmit={createLead}
              className="flex max-h-[min(92vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-[14px] border border-line bg-paper shadow-[0_24px_64px_rgba(16,20,24,0.28)] sm:rounded-[var(--radius)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-lead-title"
              onKeyDown={(e) => {
                if (e.key === "Escape") closeAddLead();
              }}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h3 id="add-lead-title" className="font-display text-lg font-bold tracking-[-0.03em]">
                    Add lead
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Walk-in, call, WhatsApp, or referral. Same phone merges into an existing lead.
                  </p>
                </div>
                <button type="button" className="btn-ghost p-1.5" aria-label="Close" onClick={closeAddLead}>
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                    Name
                  </span>
                  <input
                    className="field w-full"
                    required
                    autoFocus
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="Buyer name"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                    Phone
                  </span>
                  <input
                    className="field w-full"
                    required
                    minLength={5}
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    placeholder="+91…"
                    inputMode="tel"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                    Email (optional)
                  </span>
                  <input
                    className="field w-full"
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="name@email.com"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                      Source
                    </span>
                    <select
                      className="field w-full"
                      value={addForm.primarySource}
                      onChange={(e) => setAddForm({ ...addForm, primarySource: e.target.value })}
                    >
                      {(channels.length ? channels : [{ key: "manual", label: "Manual" } as OrgChannel]).map(
                        (c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                      Listing
                    </span>
                    <select
                      className="field w-full"
                      value={addForm.listingId}
                      onChange={(e) => setAddForm({ ...addForm, listingId: e.target.value })}
                    >
                      <option value="">None</option>
                      {listings.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                      Budget max
                    </span>
                    <input
                      className="field w-full"
                      type="number"
                      min={0}
                      value={addForm.budgetMax}
                      onChange={(e) => setAddForm({ ...addForm, budgetMax: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                      Beds wanted
                    </span>
                    <input
                      className="field w-full"
                      type="number"
                      min={0}
                      value={addForm.bedsWanted}
                      onChange={(e) => setAddForm({ ...addForm, bedsWanted: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-paper px-5 py-3">
                {addError && <p className="text-sm text-[var(--danger)]">{addError}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-ghost" onClick={closeAddLead}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={adding}>
                    {adding ? "Saving…" : "Save lead"}
                  </button>
                </div>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
