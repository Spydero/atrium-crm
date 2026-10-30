"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api, formatAed, portalLabel, STAGES } from "@/lib/api";

type Lead = {
  id: string;
  name: string;
  phone: string;
  stage: string;
  primarySource: string;
  dealValueAed: number | null;
  listing?: { id: string; title: string; coverUrl?: string | null } | null;
  sources: { source: string; createdAt: string }[];
  assignedTo?: { name: string } | null;
};

type LeadDetail = Lead & {
  notes: { id: string; body: string; createdAt: string; author?: { name: string } | null }[];
  activities: { id: string; type: string; body: string; createdAt: string }[];
  budgetMax?: number | null;
  bedsWanted?: number | null;
  communities?: string[];
};

type Listing = { id: string; title: string };

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<LeadDetail | null>(null);
  const [matches, setMatches] = useState<{ score: number; listing: { id: string; title: string; priceAed: number; community: string } }[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [testingEnabled, setTestingEnabled] = useState(false);
  const [showDemoTools, setShowDemoTools] = useState(false);

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
  }, [load]);

  const columns = useMemo(() => {
    return STAGES.filter((s) => s !== "LOST").map((stage) => ({
      stage,
      items: leads.filter((l) => l.stage === stage),
    }));
  }, [leads]);

  async function openLead(id: string) {
    const detail = await api<LeadDetail>(`/api/leads/${id}`);
    setSelected(detail);
    const m = await api<typeof matches>(`/api/leads/${id}/match`);
    setMatches(m);
  }

  async function moveStage(id: string, stage: string) {
    await api(`/api/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ stage }),
    });
    await load();
    if (selected?.id === id) await openLead(id);
  }

  async function simulate(source: "BAYUT" | "PROPERTY_FINDER") {
    const listingId = listings[0]?.id;
    const res = await api<{ fused: boolean; lead: Lead }>("/api/leads/simulate", {
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
        ? `Fused ${portalLabel(source)} into existing lead.`
        : `New ${portalLabel(source)} lead.`,
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
          <p className="mt-0.5 text-sm text-muted">
            {leads.length} in pipeline · drag cards to move stages
          </p>
        </div>
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
                  Lead Fuse test
                </p>
                <button
                  type="button"
                  onClick={() => {
                    simulate("BAYUT");
                    setShowDemoTools(false);
                  }}
                  className="btn-ghost w-full justify-start text-left text-sm"
                >
                  New Bayut enquiry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    simulate("PROPERTY_FINDER");
                    setShowDemoTools(false);
                  }}
                  className="btn-ghost w-full justify-start text-left text-sm"
                >
                  Same phone via PropertyFinder
                </button>
              </div>
            )}
          </div>
        )}
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
              <span className="text-xs font-semibold text-muted">{col.items.length}</span>
            </div>
            <div className="space-y-2">
              {col.items.map((lead) => {
                const active = selected?.id === lead.id;
                return (
                  <button
                    key={lead.id}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/lead", lead.id)}
                    onClick={() => openLead(lead.id)}
                    className={`w-full rounded-[8px] border p-3 text-left transition ${
                      active
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-paper hover:border-ink/25"
                    }`}
                  >
                    <div className="text-sm font-bold">{lead.name}</div>
                    <div className={`mt-1 text-xs ${active ? "text-white/70" : "text-muted"}`}>
                      {lead.listing?.title || "No listing"} · {formatAed(lead.dealValueAed || 0)}
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
                  {selected.phone} · {selected.sources.length} sources
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
    </div>
  );
}
