"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { downloadFile } from "@/lib/api";

export type ExportItem = {
  label: string;
  hint?: string;
  path: string;
  fallbackName: string;
  kind: "pdf" | "csv";
};

export function ExportMenu({ items, label = "Export" }: { items: ExportItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(item: ExportItem) {
    setBusy(item.path);
    setError("");
    try {
      await downloadFile(item.path, item.fallbackName);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn-ghost inline-flex items-center gap-1.5 text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Download size={14} /> {label} <ChevronDown size={13} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-64 rounded-[10px] border border-line bg-paper p-1.5 shadow-[0_12px_32px_rgba(16,20,24,0.14)]"
        >
          {items.map((item) => (
            <button
              key={item.path}
              role="menuitem"
              type="button"
              disabled={busy !== null}
              onClick={() => run(item)}
              className="flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left hover:bg-line/50 disabled:opacity-60"
            >
              <span className="mt-0.5 text-accent">
                {busy === item.path ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : item.kind === "pdf" ? (
                  <FileText size={15} />
                ) : (
                  <FileSpreadsheet size={15} />
                )}
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{item.label}</span>
                {item.hint && <span className="block text-xs text-muted">{item.hint}</span>}
              </span>
            </button>
          ))}
          {error && <p className="px-2.5 py-1.5 text-xs text-[var(--danger)]">{error}</p>}
        </div>
      )}
    </div>
  );
}
