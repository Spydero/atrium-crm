"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  allowsNoShow,
  CANCEL_REASON_OPTIONS,
  cancelReasonLabel,
  outcomeLabel,
  outcomeShort,
  typeLabel,
  type CancelReason,
  type EventOutcome,
  type EventType,
} from "@/lib/eventOutcome";

type CalEvent = {
  id: string;
  title: string;
  type: EventType;
  startsAt: string;
  endsAt?: string | null;
  outcome: EventOutcome;
  cancelReason?: CancelReason | null;
  notes?: string | null;
  feedback: string | null;
  feedbackFit: string | null;
  outcomeAt?: string | null;
  lead?: { id: string; name: string } | null;
  listing?: { id: string; title: string; community?: string } | null;
  createdBy?: { id: string; name: string } | null;
};

type LeadOpt = { id: string; name: string };
type ListingOpt = { id: string; title: string; community: string };

type StatusFilter = "all" | "upcoming" | "needs" | "done" | "noshow" | "cancelled";

type FormState = {
  type: EventType;
  title: string;
  date: string;
  time: string;
  leadId: string;
  listingId: string;
  notes: string;
};

function eventTone(ev: CalEvent, overdue: boolean) {
  if (overdue && ev.outcome === "SCHEDULED") return "bg-[#ffedd5] text-[#9a3412]";
  if (ev.outcome === "COMPLETED") return "bg-[#e8f5ec] text-[#15803d]";
  if (ev.outcome === "NO_SHOW") return "bg-[#fdeceb] text-[var(--danger)]";
  if (ev.outcome === "CANCELLED") return "bg-[#fdeceb]/70 text-[var(--danger)] line-through opacity-70";
  if (ev.type === "VIEWING") return "bg-accent-soft text-accent";
  return "bg-[#eef1f4] text-muted";
}

function pillText(ev: CalEvent, overdue: boolean) {
  const short = overdue && ev.outcome === "SCHEDULED" ? "Overdue" : outcomeShort(ev.type, ev.outcome);
  const base = `${format(new Date(ev.startsAt), "HH:mm")} ${typeLabel(ev.type)}`;
  return short ? `${base} - ${short}` : base;
}

function emptyForm(day: Date): FormState {
  return {
    type: "VIEWING",
    title: "",
    date: format(day, "yyyy-MM-dd"),
    time: "11:00",
    leadId: "",
    listingId: "",
    notes: "",
  };
}

function fromEvent(ev: CalEvent): FormState {
  const d = new Date(ev.startsAt);
  return {
    type: ev.type,
    title: ev.title,
    date: format(d, "yyyy-MM-dd"),
    time: format(d, "HH:mm"),
    leadId: ev.lead?.id || "",
    listingId: ev.listing?.id || "",
    notes: ev.notes || "",
  };
}

export default function CalendarPage() {
  const search = useSearchParams();
  const router = useRouter();
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = search.get("date");
    return d ? new Date(`${d}T12:00:00`) : new Date();
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [mode, setMode] = useState<"view" | "create" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => emptyForm(new Date()));
  const [leads, setLeads] = useState<LeadOpt[]>([]);
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [fit, setFit] = useState("good");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [cancelReason, setCancelReason] = useState<CancelReason>("CLIENT");
  const [cancelStep, setCancelStep] = useState(false);
  const [deleteStep, setDeleteStep] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => (search.get("status") as StatusFilter) || "all",
  );
  const [typeFilter, setTypeFilter] = useState<EventType | "ALL">(
    () => (search.get("type") as EventType | "ALL") || "ALL",
  );
  const [hideCancelled, setHideCancelled] = useState(search.get("hideCxl") === "1");

  const load = useCallback(async () => {
    const from = startOfWeek(startOfMonth(cursor));
    const to = endOfWeek(endOfMonth(cursor));
    const data = await api<CalEvent[]>(
      `/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`,
    );
    setEvents(data);
  }, [cursor]);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  useEffect(() => {
    Promise.all([api<LeadOpt[]>("/api/leads"), api<ListingOpt[]>("/api/listings")])
      .then(([l, li]) => {
        setLeads(l.map((x) => ({ id: x.id, name: x.name })));
        setListings(li.map((x) => ({ id: x.id, title: x.title, community: x.community })));
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    if (hideCancelled) params.set("hideCxl", "1");
    params.set("date", format(selectedDay, "yyyy-MM-dd"));
    const q = params.toString();
    router.replace(q ? `/app/calendar?${q}` : "/app/calendar", { scroll: false });
  }, [statusFilter, typeFilter, hideCancelled, selectedDay, router]);

  const now = useMemo(() => new Date(), [events]);

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (typeFilter !== "ALL" && ev.type !== typeFilter) return false;
      if (hideCancelled && ev.outcome === "CANCELLED") return false;
      const start = new Date(ev.startsAt);
      const overdue = ev.outcome === "SCHEDULED" && start < now;
      const upcoming = ev.outcome === "SCHEDULED" && start >= now;
      if (statusFilter === "upcoming" && !upcoming) return false;
      if (statusFilter === "needs" && !overdue) return false;
      if (statusFilter === "done" && ev.outcome !== "COMPLETED") return false;
      if (statusFilter === "noshow" && ev.outcome !== "NO_SHOW") return false;
      if (statusFilter === "cancelled" && ev.outcome !== "CANCELLED") return false;
      return true;
    });
  }, [events, typeFilter, hideCancelled, statusFilter, now]);

  const needsCount = useMemo(
    () => events.filter((e) => e.outcome === "SCHEDULED" && new Date(e.startsAt) < now).length,
    [events, now],
  );

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const dayEvents = useMemo(
    () =>
      filtered
        .filter((e) => isSameDay(new Date(e.startsAt), selectedDay))
        .sort((a, b) => {
          const ac = a.outcome === "CANCELLED" ? 1 : 0;
          const bc = b.outcome === "CANCELLED" ? 1 : 0;
          if (ac !== bc) return ac - bc;
          return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
        }),
    [filtered, selectedDay],
  );

  function openCreate(day: Date) {
    setSelectedDay(day);
    setSelected(null);
    setMode("create");
    setForm(emptyForm(day));
    setDeleteStep(false);
    setCancelStep(false);
  }

  function openEdit(ev: CalEvent) {
    setSelected(ev);
    setMode("edit");
    setForm(fromEvent(ev));
    setDeleteStep(false);
    setCancelStep(false);
  }

  function selectEvent(ev: CalEvent) {
    setSelected(ev);
    setMode("view");
    setNotesDraft(ev.notes || "");
    setOutcomeNote(ev.feedback || "");
    setFit(ev.feedbackFit || "good");
    setCancelStep(false);
    setDeleteStep(false);
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const startsAt = new Date(`${form.date}T${form.time}:00`);
      const lead = leads.find((l) => l.id === form.leadId);
      const listing = listings.find((l) => l.id === form.listingId);
      const title =
        form.title.trim() ||
        [typeLabel(form.type), lead?.name, listing?.title].filter(Boolean).join(" - ") ||
        typeLabel(form.type);

      if (mode === "edit" && selected) {
        const updated = await api<CalEvent>(`/api/calendar/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title,
            type: form.type,
            startsAt: startsAt.toISOString(),
            leadId: form.leadId || null,
            listingId: form.listingId || null,
            notes: form.notes.trim() || null,
          }),
        });
        setMsg("Updated.");
        setSelected(updated);
        setMode("view");
        setNotesDraft(updated.notes || "");
      } else {
        const created = await api<CalEvent>("/api/calendar", {
          method: "POST",
          body: JSON.stringify({
            title,
            type: form.type,
            startsAt: startsAt.toISOString(),
            leadId: form.leadId || null,
            listingId: form.listingId || null,
            notes: form.notes.trim() || null,
          }),
        });
        setMsg("Scheduled.");
        setSelected(created);
        setMode("view");
        setNotesDraft(created.notes || "");
        setSelectedDay(startsAt);
      }
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await api<CalEvent>(`/api/calendar/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notesDraft.trim() || null }),
      });
      setSelected(updated);
      setMsg("Notes saved.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save notes");
    } finally {
      setSaving(false);
    }
  }

  async function setOutcome(outcome: EventOutcome) {
    if (!selected) return;
    if (outcome === "CANCELLED" && !cancelStep) {
      setCancelStep(true);
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        outcome,
        feedback: outcomeNote.trim() || null,
      };
      if (outcome === "CANCELLED") body.cancelReason = cancelReason;
      if (selected.type === "VIEWING" && outcome === "COMPLETED") body.feedbackFit = fit;
      if (outcome === "SCHEDULED") {
        body.cancelReason = null;
        body.feedback = null;
        body.feedbackFit = null;
      }
      const updated = await api<CalEvent>(`/api/calendar/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setSelected(updated);
      setCancelStep(false);
      setMsg(`Marked ${outcomeLabel(updated.type, outcome).toLowerCase()}.`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not update outcome");
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(force = false) {
    if (!selected) return;
    if (!force && !deleteStep) {
      setDeleteStep(true);
      return;
    }
    setSaving(true);
    try {
      await api(`/api/calendar/${selected.id}`, { method: "DELETE" });
      setMsg("Deleted.");
      setSelected(null);
      setMode("view");
      setDeleteStep(false);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-rise space-y-4" data-testid="calendar-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">Calendar</h1>
          <p className="mt-0.5 text-sm text-muted">
            Schedule, edit and close out viewings and follow-ups. Notes stay with the event.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => setCursor(new Date())}>
            Today
          </button>
          <button type="button" className="btn-ghost p-2" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-[9rem] text-center text-sm font-bold">{format(cursor, "MMMM yyyy")}</div>
          <button type="button" className="btn-ghost p-2" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
          <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => openCreate(selectedDay)}>
            <CalendarPlus size={15} /> Schedule
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-[8px] border border-accent/20 bg-accent-soft px-3 py-2 text-sm font-semibold text-accent" data-testid="calendar-msg">
          {msg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" data-testid="calendar-filters">
        {(
          [
            ["all", "All"],
            ["upcoming", "Upcoming"],
            ["needs", `Needs outcome${needsCount ? ` (${needsCount})` : ""}`],
            ["done", "Done"],
            ["noshow", "No-show"],
            ["cancelled", "Cancelled"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === id ? "bg-accent text-white" : "bg-[#eef1f4] text-muted"
            }`}
            onClick={() => setStatusFilter(id)}
          >
            {label}
          </button>
        ))}
        <select
          className="field py-1 text-xs"
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as EventType | "ALL")}
        >
          <option value="ALL">All types</option>
          <option value="VIEWING">Viewing</option>
          <option value="CALL">Call</option>
          <option value="FOLLOW_UP">Follow-up</option>
          <option value="TASK">Task</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <input
            type="checkbox"
            className="accent-[#1a5f7a]"
            checked={hideCancelled}
            onChange={(e) => setHideCancelled(e.target.checked)}
          />
          Hide cancelled
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div>
          <div className="mb-1.5 grid grid-cols-7 gap-1.5">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5" data-testid="calendar-grid">
            {days.map((day) => {
              const inMonth = isSameMonth(day, cursor);
              const active = isSameDay(day, selectedDay);
              const today = isToday(day);
              const dayEvs = filtered
                .filter((e) => isSameDay(new Date(e.startsAt), day))
                .sort((a, b) => {
                  const ac = a.outcome === "CANCELLED" ? 1 : 0;
                  const bc = b.outcome === "CANCELLED" ? 1 : 0;
                  if (ac !== bc) return ac - bc;
                  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
                });
              const live = dayEvs.filter((e) => e.outcome !== "CANCELLED").length;
              const cxl = dayEvs.length - live;
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    setSelected(null);
                    setMode("view");
                  }}
                  onDoubleClick={() => openCreate(day)}
                  className={`min-h-[108px] rounded-[var(--radius)] border p-1.5 text-left transition ${
                    active
                      ? "border-accent bg-accent-soft/40 shadow-[0_0_0_1px_var(--accent)]"
                      : inMonth
                        ? "border-line bg-paper hover:border-ink/25"
                        : "border-transparent bg-transparent opacity-40"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold ${
                        today ? "bg-accent text-white" : active ? "text-accent" : "text-ink"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {(live > 0 || cxl > 0) && (
                      <span className="text-[10px] font-bold text-muted">
                        {live}
                        {cxl > 0 ? ` · ${cxl} cxl` : ""}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayEvs.slice(0, 3).map((ev) => {
                      const overdue = ev.outcome === "SCHEDULED" && new Date(ev.startsAt) < now;
                      return (
                        <div
                          key={ev.id}
                          title={[
                            ev.title,
                            ev.lead?.name,
                            outcomeLabel(ev.type, ev.outcome),
                            ev.cancelReason ? cancelReasonLabel(ev.cancelReason) : "",
                            ev.notes || "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${eventTone(ev, overdue)}`}
                        >
                          {pillText(ev, overdue)}
                        </div>
                      );
                    })}
                    {dayEvs.length > 3 && (
                      <div className="px-1 text-[10px] font-semibold text-muted">+{dayEvs.length - 3} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">Tip: double-click a day to schedule. Red struck-through pills are cancelled.</p>
        </div>

        <div className="space-y-3">
          <div className="surface p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Agenda</div>
                <div className="font-display mt-0.5 text-lg font-bold tracking-[-0.03em]">
                  {format(selectedDay, "EEEE, MMM d")}
                </div>
              </div>
              <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => openCreate(selectedDay)}>
                Add
              </button>
            </div>
            <div className="space-y-2" data-testid="agenda-list">
              {dayEvents.map((ev) => {
                const on = selected?.id === ev.id && mode === "view";
                const overdue = ev.outcome === "SCHEDULED" && new Date(ev.startsAt) < now;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => selectEvent(ev)}
                    className={`w-full rounded-[8px] border px-3 py-2.5 text-left transition ${
                      on ? "border-accent bg-accent-soft/50" : "border-line hover:border-ink/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-accent">{format(new Date(ev.startsAt), "h:mm a")}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${eventTone(ev, overdue)}`}>
                        {overdue ? "Overdue" : outcomeLabel(ev.type, ev.outcome)}
                      </span>
                    </div>
                    <div className={`mt-1 text-sm font-bold leading-snug ${ev.outcome === "CANCELLED" ? "line-through opacity-70" : ""}`}>
                      {ev.title}
                    </div>
                    {(ev.lead || ev.notes) && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-muted">
                        {[ev.lead?.name, ev.notes].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </button>
                );
              })}
              {!dayEvents.length && mode === "view" && (
                <div className="rounded-[8px] bg-[#f4f6f8] px-3 py-6 text-center text-sm text-muted">
                  Nothing here.{" "}
                  <button type="button" className="font-semibold text-accent" onClick={() => openCreate(selectedDay)}>
                    Add something
                  </button>
                </div>
              )}
            </div>
          </div>

          {(mode === "create" || mode === "edit") && (
            <form onSubmit={saveForm} className="animate-fade surface space-y-3 p-4" data-testid="event-form">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold">
                  {mode === "edit" ? "Edit event" : `Schedule · ${format(selectedDay, "MMM d")}`}
                </h3>
                <button
                  type="button"
                  className="text-sm font-semibold text-muted"
                  onClick={() => {
                    setMode("view");
                    if (mode === "create") setSelected(null);
                  }}
                >
                  Close
                </button>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Type</span>
                <select
                  className="field w-full"
                  aria-label="Event type"
                  value={form.type}
                  disabled={mode === "edit" && selected?.outcome !== "SCHEDULED"}
                  onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}
                >
                  <option value="VIEWING">Viewing</option>
                  <option value="CALL">Call</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="TASK">Task</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Date</span>
                  <input
                    type="date"
                    className="field w-full"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Time</span>
                  <input
                    type="time"
                    className="field w-full"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    required
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Lead</span>
                <select className="field w-full" value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
                  <option value="">No lead</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Listing</span>
                <select
                  className="field w-full"
                  value={form.listingId}
                  onChange={(e) => setForm({ ...form, listingId: e.target.value })}
                >
                  <option value="">No listing</option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} · {l.community}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Title (optional)</span>
                <input
                  className="field w-full"
                  aria-label="Event title"
                  placeholder="Auto from lead / listing if blank"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Notes</span>
                <textarea
                  className="field w-full"
                  aria-label="Event notes"
                  rows={3}
                  placeholder="Context, agenda, deal notes - e.g. client asked to pause"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              {form.type === "VIEWING" && !form.listingId && (
                <p className="text-xs text-muted">No listing - fit feedback will be less useful.</p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={saving}>
                {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save to calendar"}
              </button>
            </form>
          )}

          {selected && mode === "view" && (
            <div className="animate-fade surface space-y-4 p-4" data-testid="event-detail">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <span className="rounded bg-[#eef1f4] px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                      {typeLabel(selected.type)}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${eventTone(selected, false)}`}>
                      {outcomeLabel(selected.type, selected.outcome)}
                    </span>
                    {selected.cancelReason && (
                      <span className="rounded bg-[#ffedd5] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#9a3412]">
                        {cancelReasonLabel(selected.cancelReason)}
                      </span>
                    )}
                  </div>
                  <h2 className="font-display text-lg font-bold tracking-[-0.03em]">{selected.title}</h2>
                  <p className="text-sm text-muted">{format(new Date(selected.startsAt), "PPp")}</p>
                  {selected.createdBy && <p className="text-xs text-muted">by {selected.createdBy.name}</p>}
                  {selected.lead && <p className="mt-1 text-sm font-medium">{selected.lead.name}</p>}
                  {selected.listing && <p className="text-xs text-muted">{selected.listing.title}</p>}
                </div>
                <button type="button" className="text-sm font-semibold text-muted" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>

              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Notes</div>
                <textarea
                  className="field mt-1 w-full"
                  rows={3}
                  placeholder="Deal context, what was said, next step…"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  data-testid="event-notes"
                />
                <button type="button" className="btn-ghost mt-2 text-xs" disabled={saving} onClick={saveNotes}>
                  Save notes
                </button>
              </div>

              {selected.outcome === "SCHEDULED" && !cancelStep && (
                <div className="space-y-3">
                  {selected.type === "VIEWING" && (
                    <>
                      <select className="field w-full" value={fit} onChange={(e) => setFit(e.target.value)}>
                        <option value="good">Fit: good</option>
                        <option value="ok">Fit: ok</option>
                        <option value="poor">Fit: poor</option>
                      </select>
                    </>
                  )}
                  <textarea
                    className="field w-full"
                    rows={2}
                    placeholder="Outcome note (optional)"
                    value={outcomeNote}
                    onChange={(e) => setOutcomeNote(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" disabled={saving} onClick={() => setOutcome("COMPLETED")}>
                      {selected.type === "CALL" ? "Connected" : selected.type === "VIEWING" ? "Completed" : "Done"}
                    </button>
                    {allowsNoShow(selected.type) && (
                      <button type="button" className="btn-ghost" disabled={saving} onClick={() => setOutcome("NO_SHOW")}>
                        {selected.type === "CALL" ? "No answer" : "No-show"}
                      </button>
                    )}
                    <button type="button" className="btn-ghost" disabled={saving} onClick={() => setOutcome("CANCELLED")}>
                      Cancelled
                    </button>
                  </div>
                </div>
              )}

              {cancelStep && (
                <div className="space-y-3 rounded-[8px] border border-line bg-[#fafbfc] p-3" data-testid="cancel-step">
                  <div className="text-sm font-bold">Why cancelled?</div>
                  <select
                    className="field w-full"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value as CancelReason)}
                  >
                    {CANCEL_REASON_OPTIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="field w-full"
                    rows={2}
                    placeholder="Optional note - e.g. client paused the search"
                    value={outcomeNote}
                    onChange={(e) => setOutcomeNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary" disabled={saving} onClick={() => setOutcome("CANCELLED")}>
                      Confirm cancel
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setCancelStep(false)}>
                      Back
                    </button>
                  </div>
                </div>
              )}

              {selected.outcome !== "SCHEDULED" && (
                <div className="rounded-[8px] bg-[#eef1f4] p-3 text-sm">
                  <div className="font-bold">
                    {outcomeLabel(selected.type, selected.outcome)}
                    {selected.cancelReason ? ` · ${cancelReasonLabel(selected.cancelReason)}` : ""}
                  </div>
                  {selected.feedback && <p className="mt-1">{selected.feedbackFit ? `${selected.feedbackFit}: ` : ""}{selected.feedback}</p>}
                  {selected.outcomeAt && (
                    <p className="mt-1 text-xs text-muted">Logged {format(new Date(selected.outcomeAt), "PPp")}</p>
                  )}
                  <button type="button" className="btn-ghost mt-2 text-xs" disabled={saving} onClick={() => setOutcome("SCHEDULED")}>
                    Undo outcome
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <button type="button" className="btn-ghost inline-flex items-center gap-1.5 text-sm" onClick={() => openEdit(selected)}>
                  <Pencil size={14} /> Edit
                </button>
                {!deleteStep ? (
                  <button
                    type="button"
                    className="btn-ghost inline-flex items-center gap-1.5 text-sm text-[var(--danger)]"
                    onClick={() => removeEvent(false)}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                ) : (
                  <div className="w-full space-y-2 rounded-[8px] border border-[var(--danger)]/20 bg-[#fdeceb] p-3" data-testid="delete-confirm">
                    <p className="text-sm font-semibold text-[var(--danger)]">
                      {selected.outcome !== "SCHEDULED" || selected.type === "VIEWING"
                        ? "This removes it from reports. Prefer Cancel if you want to keep the record."
                        : "Delete this event? This cannot be undone."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selected.outcome === "SCHEDULED" && (
                        <button type="button" className="btn-primary" onClick={() => { setDeleteStep(false); setCancelStep(true); }}>
                          Cancel event instead
                        </button>
                      )}
                      <button type="button" className="btn-ghost text-[var(--danger)]" disabled={saving} onClick={() => removeEvent(true)}>
                        Delete anyway
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setDeleteStep(false)}>
                        Keep
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
