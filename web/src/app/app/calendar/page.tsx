"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
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
  listing?: { title: string } | null;
};

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [feedback, setFeedback] = useState("");
  const [fit, setFit] = useState("good");

  const load = useCallback(async () => {
    const from = startOfWeek(startOfMonth(cursor));
    const to = endOfWeek(endOfMonth(cursor));
    const data = await api<CalEvent[]>(
      `/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`,
    );
    setEvents(data);
  }, [cursor]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

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
    await load();
  }

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">
          Calendar
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost px-3 py-2"
            onClick={() => setCursor(addDays(startOfMonth(cursor), -1))}
          >
            Prev
          </button>
          <div className="font-display min-w-[140px] text-center text-base font-bold">
            {format(cursor, "MMMM yyyy")}
          </div>
          <button
            type="button"
            className="btn-ghost px-3 py-2"
            onClick={() => setCursor(addDays(endOfMonth(cursor), 1))}
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.startsAt), day));
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[96px] rounded-[var(--radius)] border p-1.5 ${
                isSameMonth(day, cursor)
                  ? "border-line bg-paper"
                  : "border-transparent opacity-35"
              }`}
            >
              <div className="mb-1 text-xs font-bold">{format(day, "d")}</div>
              <div className="space-y-1">
                {dayEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelected(ev)}
                    className={`block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-semibold ${
                      ev.type === "VIEWING"
                        ? "bg-accent-soft text-accent"
                        : "bg-[#eef1f4] text-muted"
                    }`}
                  >
                    {format(new Date(ev.startsAt), "HH:mm")} {ev.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="animate-fade surface p-5">
          <div className="flex justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold tracking-[-0.03em]">
                {selected.title}
              </h2>
              <p className="text-sm text-muted">
                {format(new Date(selected.startsAt), "PPp")} · {selected.type}
                {selected.outcome ? ` · ${selected.outcome}` : ""}
              </p>
              {selected.lead && (
                <p className="mt-1 text-sm font-medium">{selected.lead.name}</p>
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
          {selected.type === "VIEWING" && selected.outcome === "SCHEDULED" && (
            <div className="mt-4 space-y-3">
              <select
                className="field max-w-xs"
                value={fit}
                onChange={(e) => setFit(e.target.value)}
              >
                <option value="good">Fit: good</option>
                <option value="ok">Fit: ok</option>
                <option value="poor">Fit: poor</option>
              </select>
              <textarea
                className="field"
                rows={3}
                placeholder="Feedback"
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
  );
}
