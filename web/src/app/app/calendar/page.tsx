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
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted">Viewing OS — schedule, complete, capture feedback.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-line bg-paper px-3 py-2 text-sm"
            onClick={() => setCursor(addDays(startOfMonth(cursor), -1))}
          >
            Prev
          </button>
          <div className="font-display min-w-[140px] text-center text-lg font-bold">
            {format(cursor, "MMMM yyyy")}
          </div>
          <button
            type="button"
            className="rounded-xl border border-line bg-paper px-3 py-2 text-sm"
            onClick={() => setCursor(addDays(endOfMonth(cursor), 1))}
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 text-xs font-semibold text-muted">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.startsAt), day));
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[100px] rounded-xl border p-2 ${
                isSameMonth(day, cursor)
                  ? "border-line bg-paper"
                  : "border-transparent bg-transparent opacity-40"
              }`}
            >
              <div className="mb-1 text-xs font-semibold">{format(day, "d")}</div>
              <div className="space-y-1">
                {dayEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelected(ev)}
                    className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium ${
                      ev.type === "VIEWING"
                        ? "bg-cove-soft text-cove"
                        : "bg-canvas text-muted"
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
        <div className="animate-fade rounded-2xl border border-line bg-paper p-5">
          <div className="flex justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold">{selected.title}</h2>
              <p className="text-sm text-muted">
                {format(new Date(selected.startsAt), "PPp")} · {selected.type} ·{" "}
                {selected.outcome || "—"}
              </p>
              {selected.lead && (
                <p className="mt-1 text-sm">Lead: {selected.lead.name}</p>
              )}
            </div>
            <button type="button" className="text-sm text-muted" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          {selected.type === "VIEWING" && selected.outcome === "SCHEDULED" && (
            <div className="mt-4 space-y-3">
              <select
                className="rounded-xl border border-line px-3 py-2 text-sm"
                value={fit}
                onChange={(e) => setFit(e.target.value)}
              >
                <option value="good">Fit: good</option>
                <option value="ok">Fit: ok</option>
                <option value="poor">Fit: poor</option>
              </select>
              <textarea
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
                rows={3}
                placeholder="Viewing feedback…"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => completeViewing("COMPLETED")}
                  className="rounded-xl bg-cove px-3 py-2 text-sm font-semibold text-white"
                >
                  Mark completed
                </button>
                <button
                  type="button"
                  onClick={() => completeViewing("NO_SHOW")}
                  className="rounded-xl border border-line px-3 py-2 text-sm font-semibold"
                >
                  No-show
                </button>
                <button
                  type="button"
                  onClick={() => completeViewing("CANCELLED")}
                  className="rounded-xl border border-line px-3 py-2 text-sm font-semibold"
                >
                  Cancelled
                </button>
              </div>
            </div>
          )}
          {selected.feedback && (
            <p className="mt-3 rounded-xl bg-canvas p-3 text-sm">
              Feedback ({selected.feedbackFit}): {selected.feedback}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
