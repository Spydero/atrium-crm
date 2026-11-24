"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useApiQuery } from "@/lib/use-api-query";
import { api, portalLabel } from "@/lib/api";

type SpendRow = {
  source: string;
  label?: string;
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

type EditorProps = {
  onClose: () => void;
  focusSource?: string | null;
  onSaved: () => void;
};

export function SourceSpendEditor({ open, ...props }: EditorProps & { open: boolean }) {
  return open ? <SpendEditor {...props} /> : null;
}

function SpendEditor({ onClose, focusSource, onSaved }: EditorProps) {
  const [month, setMonth] = useState(currentMonth);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { data, error, loading, refresh } = useApiQuery<{ month: string; rows: SpendRow[] }>(
    month ? `/api/money/spend?month=${encodeURIComponent(month)}` : null,
  );
  const rows = data?.rows ?? [];
  const amount = (row: SpendRow) => draft[row.source] ?? (row.amount == null ? "" : String(row.amount));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setBusy(true);
    setSaveError("");
    try {
      const entries = rows.map((r) => {
        const raw = amount(r).trim();
        if (raw === "") return { source: r.source, amount: null };
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid amount for ${r.label || portalLabel(r.source)}`);
        return { source: r.source, amount: n };
      });
      await api("/api/money/spend", {
        method: "PUT",
        body: JSON.stringify({ month, entries }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save");
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
          <label htmlFor="spend-month" className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Month</label>
          <input
            id="spend-month"
            type="month"
            disabled={busy}
            className="field mt-1 w-full"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setDraft({});
              setSaveError("");
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && <p className="text-sm text-muted">Loading…</p>}
          {error && <p role="alert" className="mb-3 text-sm text-[var(--danger)]">{error} <button type="button" className="underline" onClick={refresh}>Retry</button></p>}
          {saveError && <p role="alert" className="mb-3 text-sm text-[var(--danger)]">{saveError}</p>}
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.source}
                className={`rounded-[10px] border border-line p-3 ${
                  focusSource === r.source ? "border-accent bg-accent-soft/40" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.label || portalLabel(r.source)}</span>
                  {r.inherited && r.fromMonth && (
                    <span className="text-[11px] text-muted">Using {r.amount?.toLocaleString()} from {r.fromMonth}</span>
                  )}
                </div>
                <input
                  className="field mt-2 w-full"
                  inputMode="numeric"
                  placeholder="Not entered"
                  value={amount(r)}
                  disabled={busy}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.source]: e.target.value }))}
                  aria-label={`Spend for ${r.label || portalLabel(r.source)}`}
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
          <button type="button" className="btn-primary" disabled={busy || loading || !data || Boolean(error)} onClick={save}>
            {busy ? "Saving…" : "Save spend"}
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
