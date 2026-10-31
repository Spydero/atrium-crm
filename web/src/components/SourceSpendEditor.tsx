"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { api, portalLabel } from "@/lib/api";

type SpendRow = {
  source: string;
  amount: number | null;
  inherited: boolean;
  fromMonth: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SourceSpendEditor({
  open,
  onClose,
  focusSource,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  focusSource?: string | null;
  onSaved: () => void;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<SpendRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
    setLoaded(false);
    api<{ month: string; rows: SpendRow[] }>(`/api/money/spend?month=${month}`)
      .then((r) => {
        setRows(r.rows);
        const d: Record<string, string> = {};
        for (const row of r.rows) {
          d[row.source] = row.amount == null ? "" : String(row.amount);
        }
        setDraft(d);
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load spend"));
  }, [open, month]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const entries = rows.map((r) => {
        const raw = draft[r.source]?.trim() ?? "";
        if (raw === "") return { source: r.source, amount: null };
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid amount for ${portalLabel(r.source)}`);
        return { source: r.source, amount: n };
      });
      await api("/api/money/spend", {
        method: "PUT",
        body: JSON.stringify({ month, entries }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="animate-fade fixed inset-0 z-50 flex justify-end bg-black/40"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      data-testid="spend-editor"
    >
      <aside className="flex h-full w-full max-w-md flex-col bg-paper shadow-xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-bold tracking-[-0.03em]">Entered spend</h2>
            <p className="mt-1 text-sm text-muted">
              Typed in by your team, not synced from ad platforms. Applies from this month until you change it.
            </p>
          </div>
          <button type="button" className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-line px-5 py-3">
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Month</label>
          <input
            type="month"
            className="field mt-1 w-full"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {!loaded && !error && <p className="text-sm text-muted">Loading…</p>}
          {error && <p className="mb-3 text-sm font-semibold text-[var(--mark)]">{error}</p>}
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.source}
                className={`rounded-[10px] border border-line p-3 ${
                  focusSource === r.source ? "border-accent bg-accent-soft/40" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{portalLabel(r.source)}</span>
                  {r.inherited && r.fromMonth && (
                    <span className="text-[11px] text-muted">Using {r.amount?.toLocaleString()} from {r.fromMonth}</span>
                  )}
                </div>
                <input
                  className="field mt-2 w-full"
                  inputMode="numeric"
                  placeholder="Not entered"
                  value={draft[r.source] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.source]: e.target.value }))}
                  aria-label={`Spend for ${portalLabel(r.source)}`}
                />
                <p className="mt-1 text-[11px] text-muted">Leave blank for not entered. Enter 0 for free sources.</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy || !loaded} onClick={save}>
            {busy ? "Saving…" : "Save spend"}
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
