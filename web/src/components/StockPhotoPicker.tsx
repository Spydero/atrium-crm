"use client";

import { useState } from "react";
import { useApiQuery } from "@/lib/use-api-query";

type StockPhoto = {
  id: string;
  url: string;
  thumb: string;
  photographer?: string;
  attribution?: string;
};

type PlaceOption = {
  id: string;
  label: string;
  query: string;
};

type Props = {
  selectedUrl: string | null;
  onSelect: (url: string) => void;
  /** Used once on mount - not on every keystroke from the parent form */
  initialQuery?: string;
};

export function StockPhotoPicker({ selectedUrl, onSelect, initialQuery }: Props) {
  const [q, setQ] = useState(initialQuery || "apartment living");
  const [query, setQuery] = useState(q);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const { data: placeCatalog } = useApiQuery<{ places: PlaceOption[] }>("/api/testing/places");
  const { data, error, loading, refresh } = useApiQuery<{
    photos: StockPhoto[];
    provider: string;
    note?: string;
  }>(`/api/testing/photos?q=${encodeURIComponent(query)}`);

  function load(value = q) {
    setBroken({});
    if (value === query) refresh();
    else setQuery(value);
  }

  const places = placeCatalog?.places ?? [];
  const provider = data?.provider;
  const note = data?.note;
  const visible = (data?.photos ?? []).filter((p) => !broken[p.id]);

  return (
    <div className="space-y-3 rounded-[var(--radius)] border border-dashed border-line bg-[#fafbfc] p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        Stock photos {provider ? `(${provider})` : "(local)"}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="field min-w-0 flex-1 py-1.5 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              load();
            }
          }}
          placeholder="villa pool, office…"
          aria-label="Search stock photos"
        />
        <button
          type="button"
          className="btn-ghost h-[38px] shrink-0 px-3 text-xs"
          onClick={() => load()}
        >
          {loading ? "…" : "Search"}
        </button>
      </div>

      {places.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {places.map((p) => (
            <button
              key={p.id}
              type="button"
              className="filter-chip !px-2.5 !py-1 text-xs"
              data-on={q === p.query}
              onClick={() => {
                setQ(p.query);
                load(p.query);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto overscroll-contain pr-0.5 sm:grid-cols-4">
        {visible.map((p) => {
          const on = selectedUrl === p.url;
          return (
            <button
              key={p.id}
              type="button"
              title={p.attribution || p.photographer}
              aria-label={p.attribution || p.photographer || "Select stock photo"}
              aria-pressed={on}
              onClick={() => onSelect(p.url)}
              className={`overflow-hidden rounded-[6px] border-2 ${
                on ? "border-accent" : "border-transparent hover:border-line"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.thumb}
                alt=""
                className="h-16 w-full object-cover"
                loading="lazy"
                onError={() => setBroken((prev) => ({ ...prev, [p.id]: true }))}
              />
            </button>
          );
        })}
      </div>
      {note && <p className="text-[11px] leading-snug text-muted">{note}</p>}
      {!error && !loading && !visible.length && (
        <p className="text-xs text-muted">No photos for that search. Try a place chip.</p>
      )}
    </div>
  );
}
