"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

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
  const bootQuery = useRef(initialQuery || "apartment living").current;
  const [q, setQ] = useState(bootQuery);
  const [places, setPlaces] = useState<PlaceOption[]>([]);
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(query = q) {
    setLoading(true);
    setError("");
    setBroken({});
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
    api<{ places: PlaceOption[] }>("/api/testing/places")
      .then((d) => setPlaces(d.places || []))
      .catch(() => setPlaces([]));
    load(bootQuery).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = photos.filter((p) => !broken[p.id]);

  return (
    <div className="space-y-2 rounded-[var(--radius)] border border-dashed border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          Stock photos {provider ? `(${provider})` : ""}
        </div>
        <form
          className="flex min-w-0 flex-1 justify-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <input
            className="field min-w-0 max-w-[200px] flex-1 py-1.5 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="villa pool, office…"
          />
          <button type="submit" className="btn-ghost shrink-0 px-2.5 py-1.5 text-xs">
            {loading ? "…" : "Search"}
          </button>
        </form>
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

      {note && <p className="text-xs text-muted">{note}</p>}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {visible.map((p) => {
          const on = selectedUrl === p.url;
          return (
            <button
              key={p.id}
              type="button"
              title={p.attribution || p.photographer}
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
      {!loading && !visible.length && (
        <p className="text-xs text-muted">No photos for that search. Try a place chip.</p>
      )}
    </div>
  );
}
