"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
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
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";

type CalEvent = {
  id: string;
  title: string;
  type: string;
  startsAt: string;
  outcome: string | null;
  feedback: string | null;
  feedbackFit: string | null;
  lead?: { id: string; name: string } | null;
  listing?: { id: string; title: string; community?: string } | null;
};

type LeadOpt = { id: string; name: string };
type ListingOpt = { id: string; title: string; community: string };

function eventTone(ev: CalEvent) {
  if (ev.outcome === "COMPLETED") return "bg-[#e8f5ec] text-[#15803d]";
  if (ev.outcome === "NO_SHOW" || ev.outcome === "CANCELLED")
    return "bg-[#fdeceb] text-[var(--danger)]";
  if (ev.type === "VIEWING") return "bg-accent-soft text-accent";
  return "bg-[#eef1f4] text-muted";
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [feedback, setFeedback] = useState("");
  const [fit, setFit] = useState("good");
  const [showCreate, setShowCreate] = useState(false);
  const [leads, setLeads] = useState<LeadOpt[]>([]);
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    type: "VIEWING" as "VIEWING" | "CALL" | "FOLLOW_UP" | "TASK",
    title: "",
    time: "11:00",
    leadId: "",
    listingId: "",
  });

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
    Promise.all([
      api<LeadOpt[]>("/api/leads"),
      api<ListingOpt[]>("/api/listings"),
    ])
      .then(([l, li]) => {
        setLeads(l.map((x) => ({ id: x.id, name: x.name })));
        setListings(
          li.map((x) => ({ id: x.id, title: x.title, community: x.community })),
        );
      })
      .catch(() => null);
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => isSameDay(new Date(e.startsAt), selectedDay))
        .sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
        ),
    [events, selectedDay],
  );

  function openCreate(day = selectedDay) {
    setSelectedDay(day);
    setSelected(null);
    setForm({
      type: "VIEWING",
      title: "",
      time: "11:00",
      leadId: leads[0]?.id || "",
      listingId: listings[0]?.id || "",
    });
    setShowCreate(true);
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const [hh, mm] = form.time.split(":").map(Number);
      const starts = new Date(selectedDay);
      starts.setHours(hh || 11, mm || 0, 0, 0);
      const ends = new Date(starts.getTime() + 60 * 60 * 1000);

      const leadName = leads.find((l) => l.id === form.leadId)?.name;
      const listingTitle = listings.find((l) => l.id === form.listingId)?.title;
      const title =
        form.title.trim() ||
        (form.type === "VIEWING"
          ? `Viewing · ${listingTitle || leadName || "Property"}`
          : `${form.type.replace("_", " ")} · ${leadName || "Follow-up"}`);

      await api("/api/calendar", {
        method: "POST",
        body: JSON.stringify({
          title,
          type: form.type,
          startsAt: starts.toISOString(),
          endsAt: ends.toISOString(),
          leadId: form.leadId || null,
          listingId: form.listingId || null,
        }),
      });
      setShowCreate(false);
      setMsg("Scheduled.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not schedule");
    } finally {
      setSaving(false);
    }
  }

  async function completeViewing(outcome: "COMPLETED" | "NO_SHOW" | "CANCELLED") {
    if (!selected) return;
    await api(`/api/calendar/${selected.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        outcome,
        feedback: feedback || null,
        feedbackFit: outcome === "COMPLETED" ? fit : null,
      }),
    });
    setSelected(null);
    setFeedback("");
    setMsg(`Marked ${outcome.toLowerCase().replace("_", " ")}.`);
    await load();
  }

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">
            Calendar
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Click a day to see the agenda · schedule viewings and follow-ups
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost px-3 py-2 text-sm"
            onClick={() => {
              const now = new Date();
              setCursor(now);
              setSelectedDay(now);
            }}
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost px-2.5 py-2"
              aria-label="Previous month"
              onClick={() => setCursor(addMonths(cursor, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="font-display min-w-[150px] text-center text-base font-bold">
              {format(cursor, "MMMM yyyy")}
            </div>
            <button
              type="button"
              className="btn-ghost px-2.5 py-2"
              aria-label="Next month"
              onClick={() => setCursor(addMonths(cursor, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button type="button" className="btn-primary text-sm" onClick={() => openCreate()}>
            <span className="inline-flex items-center gap-1.5">
              <CalendarPlus size={15} /> Schedule
            </span>
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-[var(--radius)] border border-accent/20 bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          {msg}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div>
          <div className="mb-1.5 grid grid-cols-7 gap-1.5">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const inMonth = isSameMonth(day, cursor);
              const active = isSameDay(day, selectedDay);
              const today = isToday(day);
              const dayEvs = events.filter((e) =>
                isSameDay(new Date(e.startsAt), day),
              );
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    setSelected(null);
                    setShowCreate(false);
                  }}
                  onDoubleClick={() => openCreate(day)}
                  className={`min-h-[102px] rounded-[var(--radius)] border p-1.5 text-left transition ${
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
                        today
                          ? "bg-accent text-white"
                          : active
                            ? "text-accent"
                            : "text-ink"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {dayEvs.length > 0 && (
                      <span className="text-[10px] font-bold text-muted">
                        {dayEvs.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayEvs.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${eventTone(ev)}`}
                      >
                        {format(new Date(ev.startsAt), "HH:mm")}{" "}
                        {ev.type === "VIEWING" ? "Viewing" : ev.type.replace("_", " ")}
                      </div>
                    ))}
                    {dayEvs.length > 3 && (
                      <div className="px-1 text-[10px] font-semibold text-muted">
                        +{dayEvs.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            Tip: double-click a day to schedule quickly.
          </p>
        </div>

        <div className="space-y-3">
          <div className="surface p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Agenda
                </div>
                <div className="font-display mt-0.5 text-lg font-bold tracking-[-0.03em]">
                  {format(selectedDay, "EEEE, MMM d")}
                </div>
              </div>
              <button
                type="button"
                className="btn-primary px-3 py-2 text-xs"
                onClick={() => openCreate(selectedDay)}
              >
                Add
              </button>
            </div>

            <div className="space-y-2">
              {dayEvents.map((ev) => {
                const on = selected?.id === ev.id;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      setSelected(ev);
                      setShowCreate(false);
                      setFeedback(ev.feedback || "");
                      setFit(ev.feedbackFit || "good");
                    }}
                    className={`w-full rounded-[8px] border px-3 py-2.5 text-left transition ${
                      on
                        ? "border-accent bg-accent-soft/50"
                        : "border-line hover:border-ink/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-accent">
                        {format(new Date(ev.startsAt), "h:mm a")}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${eventTone(ev)}`}
                      >
                        {ev.outcome || ev.type}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-bold leading-snug">{ev.title}</div>
                    {(ev.lead || ev.listing) && (
                      <div className="mt-0.5 text-xs text-muted">
                        {[ev.lead?.name, ev.listing?.title].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </button>
                );
              })}
              {!dayEvents.length && !showCreate && (
                <div className="rounded-[8px] bg-[#f4f6f8] px-3 py-6 text-center text-sm text-muted">
                  Nothing scheduled.{" "}
                  <button
                    type="button"
                    className="font-semibold text-accent"
                    onClick={() => openCreate(selectedDay)}
                  >
                    Add a viewing
                  </button>
                </div>
              )}
            </div>
          </div>

          {showCreate && (
            <form onSubmit={createEvent} className="animate-fade surface space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold">
                  Schedule · {format(selectedDay, "MMM d")}
                </h3>
                <button
                  type="button"
                  className="text-sm font-semibold text-muted"
                  onClick={() => setShowCreate(false)}
                >
                  Close
                </button>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Type
                </span>
                <select
                  className="field w-full"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as typeof form.type })
                  }
                >
                  <option value="VIEWING">Viewing</option>
                  <option value="CALL">Call</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="TASK">Task</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Time
                </span>
                <input
                  type="time"
                  className="field w-full"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Lead
                </span>
                <select
                  className="field w-full"
                  value={form.leadId}
                  onChange={(e) => setForm({ ...form, leadId: e.target.value })}
                >
                  <option value="">No lead</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Listing
                </span>
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
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Title (optional)
                </span>
                <input
                  className="field w-full"
                  placeholder="Auto from lead / listing if blank"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <button type="submit" className="btn-primary w-full" disabled={saving}>
                {saving ? "Saving…" : "Save to calendar"}
              </button>
            </form>
          )}

          {selected && !showCreate && (
            <div className="animate-fade surface p-4">
              <div className="flex justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-bold tracking-[-0.03em]">
                    {selected.title}
                  </h2>
                  <p className="text-sm text-muted">
                    {format(new Date(selected.startsAt), "PPp")}
                  </p>
                  {selected.lead && (
                    <p className="mt-1 text-sm font-medium">{selected.lead.name}</p>
                  )}
                  {selected.listing && (
                    <p className="text-xs text-muted">{selected.listing.title}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="text-sm font-semibold text-muted"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>

              {selected.type === "VIEWING" &&
                (selected.outcome === "SCHEDULED" || !selected.outcome) && (
                  <div className="mt-4 space-y-3">
                    <select
                      className="field w-full"
                      value={fit}
                      onChange={(e) => setFit(e.target.value)}
                    >
                      <option value="good">Fit: good</option>
                      <option value="ok">Fit: ok</option>
                      <option value="poor">Fit: poor</option>
                    </select>
                    <textarea
                      className="field w-full"
                      rows={3}
                      placeholder="Viewing feedback"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => completeViewing("COMPLETED")}
                        className="btn-primary"
                      >
                        Completed
                      </button>
                      <button
                        type="button"
                        onClick={() => completeViewing("NO_SHOW")}
                        className="btn-ghost"
                      >
                        No-show
                      </button>
                      <button
                        type="button"
                        onClick={() => completeViewing("CANCELLED")}
                        className="btn-ghost"
                      >
                        Cancelled
                      </button>
                    </div>
                  </div>
                )}

              {selected.feedback && (
                <p className="mt-3 rounded-[var(--radius)] bg-[#eef1f4] p-3 text-sm">
                  {selected.feedbackFit ? `${selected.feedbackFit}: ` : ""}
                  {selected.feedback}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
