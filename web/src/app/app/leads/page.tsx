"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
        ? `Lead Fuse: ${portalLabel(source)} enquiry merged into one lead.`
        : `New lead from ${portalLabel(source)}.`,
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
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted">
            Pipeline with Lead Fuse — one phone, one relationship.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => simulate("BAYUT")}
            className="rounded-xl border border-line bg-paper px-3 py-2 text-sm font-semibold"
          >
            Simulate Bayut lead
          </button>
          <button
            type="button"
            onClick={() => simulate("PROPERTY_FINDER")}
            className="rounded-xl bg-cove px-3 py-2 text-sm font-semibold text-white"
          >
            Simulate PF (same phone)
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl border border-cove/20 bg-cove-soft px-4 py-3 text-sm text-cove">
          {msg}
        </div>
      )}

      <div className="grid gap-4 pb-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {columns.map((col) => (
          <div
            key={col.stage}
            className="min-w-0 rounded-2xl border border-line bg-paper/70 p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              const id = e.dataTransfer.getData("text/lead");
              if (id) await moveStage(id, col.stage);
            }}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-sm font-semibold">{col.stage}</span>
              <span className="rounded-md bg-canvas px-2 py-0.5 text-xs text-muted">
                {col.items.length}
              </span>
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
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-cove bg-cove text-white"
                        : "border-line bg-paper hover:border-cove/40"
                    }`}
                  >
                    <div className="font-semibold">{lead.name}</div>
                    <div className={`mt-1 text-xs ${active ? "text-white/80" : "text-muted"}`}>
                      {lead.listing?.title || "No listing"} · {formatAed(lead.dealValueAed || 0)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[...new Set(lead.sources.map((s) => s.source))].map((s) => (
                        <span
                          key={s}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                            active ? "bg-white/15" : "bg-canvas text-muted"
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
        <div className="animate-fade grid gap-4 rounded-2xl border border-line bg-paper p-5 lg:grid-cols-2">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-bold">{selected.name}</h2>
                <p className="text-sm text-muted">
                  {selected.phone} · {selected.sources.length} source event(s)
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => moveStage(selected.id, s)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    selected.stage === s ? "bg-cove text-white" : "bg-canvas text-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={scheduleViewing}
              className="mt-4 rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white"
            >
              Schedule viewing
            </button>
            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold">Notes</div>
              <div className="space-y-2">
                {selected.notes.map((n) => (
                  <div key={n.id} className="rounded-lg bg-canvas px-3 py-2 text-sm">
                    {n.body}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-line px-3 py-2 text-sm"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note"
                />
                <button
                  type="button"
                  onClick={addNote}
                  className="rounded-xl border border-line px-3 text-sm font-semibold"
                >
                  Add
                </button>
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold">Activity</div>
              <ul className="space-y-2 text-sm text-muted">
                {selected.activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-cove/30 pl-3">
                    <span className="font-medium text-ink">{a.type}</span> — {a.body}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">Smart Match</div>
            <p className="mb-3 text-xs text-muted">
              Rule-based listings for budget / beds / community.
            </p>
            <div className="space-y-2">
              {matches.slice(0, 5).map((m) => (
                <div
                  key={m.listing.id}
                  className="flex items-center justify-between rounded-xl border border-line px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{m.listing.title}</div>
                    <div className="text-xs text-muted">
                      {m.listing.community} · {formatAed(m.listing.priceAed)}
                    </div>
                  </div>
                  <span className="rounded-md bg-cove-soft px-2 py-1 text-xs font-bold text-cove">
                    {m.score}
                  </span>
                </div>
              ))}
              {!matches.length && (
                <p className="text-sm text-muted">No matches yet — set budget/beds on lead.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
