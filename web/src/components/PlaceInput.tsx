"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { api } from "@/lib/api";

export type PlaceValue = {
  community: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
};

type Hit = {
  placeId: string;
  label: string;
  community: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
};

export function PlaceInput({
  value,
  onChange,
  defaultCity = "",
}: {
  value: PlaceValue;
  onChange: (next: PlaceValue) => void;
  defaultCity?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState(
    [value.community, value.city].filter(Boolean).join(", "),
  );
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<{ results: Hit[] }>(
          `/api/places/search?q=${encodeURIComponent(q.trim())}`,
        );
        setHits(data.results || []);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 320);
  }

  function pick(hit: Hit) {
    onChange({
      community: hit.community || hit.label.split(",")[0]?.trim() || "",
      city: hit.city || defaultCity,
      address: hit.address,
      lat: hit.lat,
      lng: hit.lng,
      placeId: hit.placeId,
    });
    setQuery(hit.label);
    setOpen(false);
    setHits([]);
  }

  function clearCoords() {
    onChange({
      ...value,
      lat: null,
      lng: null,
      placeId: null,
    });
  }

  return (
    <div ref={wrapRef} className="relative space-y-2">
      <label className="block space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          Location search
        </span>
        <div className="relative">
          <MapPin
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="field w-full pl-9"
            placeholder="Search a real place, or type below manually"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              search(e.target.value);
            }}
            onFocus={() => hits.length && setOpen(true)}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">
              …
            </span>
          )}
        </div>
      </label>

      {open && hits.length > 0 && (
        <ul
          id={listId}
          className="absolute z-20 max-h-56 w-full overflow-auto rounded-[8px] border border-line bg-paper shadow-[0_12px_32px_rgba(16,20,24,0.12)]"
          role="listbox"
        >
          {hits.map((hit) => (
            <li key={hit.placeId}>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-accent-soft/50"
                onClick={() => pick(hit)}
              >
                <div className="font-semibold text-ink line-clamp-1">
                  {hit.community || hit.label.split(",")[0]}
                </div>
                <div className="mt-0.5 text-xs text-muted line-clamp-2">{hit.label}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            Community / area
          </span>
          <input
            className="field w-full"
            required
            value={value.community}
            onChange={(e) =>
              onChange({
                ...value,
                community: e.target.value,
                placeId: null,
              })
            }
            placeholder="Manual area name"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            City
          </span>
          <input
            className="field w-full"
            value={value.city}
            onChange={(e) =>
              onChange({
                ...value,
                city: e.target.value,
                placeId: null,
              })
            }
            placeholder={defaultCity || "City"}
          />
        </label>
      </div>

      {value.lat != null && value.lng != null ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded bg-accent-soft px-2 py-1 font-semibold text-accent">
            Pin {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-semibold text-muted hover:text-ink"
            onClick={clearCoords}
          >
            <X size={12} /> Clear map pin
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Optional: pick a search result to drop a map pin. Manual area/city works without
          coordinates.
        </p>
      )}
    </div>
  );
}
