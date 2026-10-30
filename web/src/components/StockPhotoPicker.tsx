"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type StockPhoto = {
  id: string;
  url: string;
  thumb: string;
  photographer?: string;
  attribution?: string;
};

type Props = {
  selectedUrl: string | null;
  onSelect: (url: string) => void;
};

export function StockPhotoPicker({ selectedUrl, onSelect }: Props) {
  const [q, setQ] = useState("modern apartment");
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [provider, setProvider] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(query = q) {
    setLoading(true);
    setError("");
    try {
      const data = await api<{
        photos: StockPhoto[];
        provider: string;
        note?: string;
      }>(`/api/testing/photos?q=${encodeURIComponent(query)}`);
      setPhotos(data.photos);
      setProvider(data.provider);
      setNote(data.note || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load photos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2 rounded-[var(--radius)] border border-dashed border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          Test photos {provider ? `(${provider})` : ""}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <input
            className="field w-40 py-1.5 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search term"
          />
          <button type="submit" className="btn-ghost px-2.5 py-1.5 text-xs">
            {loading ? "…" : "Search"}
          </button>
        </form>
      </div>
      {note && <p className="text-xs text-muted">{note}</p>}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {photos.map((p) => {
          const on = selectedUrl === p.url;
          return (
            <button
              key={p.id}
              type="button"
              title={p.attribution || p.photographer}
              onClick={() => onSelect(p.url)}
              className={`overflow-hidden rounded-[6px] border-2 ${
                on ? "border-accent" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt="" className="h-16 w-full object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
