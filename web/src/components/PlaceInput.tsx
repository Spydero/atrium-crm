"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { api } from "@/lib/api";
import { ClickPinMap } from "@/components/ListingMap";

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

/** Parse "19.12, 72.84" / "19.12 72.84" / Google Maps style pairs from phones. */
export function parseLatLng(raw: string): { lat: number; lng: number } | null {
  const cleaned = raw.trim().replace(/°/g, " ");
  const m = cleaned.match(
    /(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/,
  );
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  // Prefer lat,lng; if first looks like longitude (>90), swap.
  let lat = a;
  let lng = b;
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
    lat = b;
    lng = a;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

const CITY_FALLBACKS: Record<string, { lat: number; lng: number }> = {
  mumbai: { lat: 19.076, lng: 72.8777 },
  dubai: { lat: 25.2048, lng: 55.2708 },
  "abu dhabi": { lat: 24.4539, lng: 54.3773 },
  delhi: { lat: 28.6139, lng: 77.209 },
  "new delhi": { lat: 28.6139, lng: 77.209 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  pune: { lat: 18.5204, lng: 73.8567 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  freiburg: { lat: 47.999, lng: 7.8421 },
};

function fallbackForCity(city: string, defaultCity: string) {
  const key = (city || defaultCity || "").trim().toLowerCase();
  if (!key) return CITY_FALLBACKS.mumbai;
  for (const [name, coords] of Object.entries(CITY_FALLBACKS)) {
    if (key.includes(name)) return coords;
  }
  return CITY_FALLBACKS.mumbai;
}

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
  const [searchError, setSearchError] = useState("");
  const [coordsText, setCoordsText] = useState(
    value.lat != null && value.lng != null ? `${value.lat}, ${value.lng}` : "",
  );
  const [coordsError, setCoordsError] = useState("");
  const [showPinMap, setShowPinMap] = useState(
    value.lat != null && value.lng != null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (value.lat != null && value.lng != null) {
      setCoordsText(`${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}`);
      setShowPinMap(true);
    }
  }, [value.lat, value.lng]);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      setSearchError("");
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      try {
        const data = await api<{ results: Hit[] }>(
          `/api/places/search?q=${encodeURIComponent(q.trim())}`,
        );
        const next = data.results || [];
        setHits(next);
        setOpen(true);
        if (!next.length) {
          setSearchError("No matches. Try a shorter query, paste coordinates, or tap the map.");
        }
      } catch {
        setHits([]);
        setSearchError("Place search unavailable. Paste coordinates or tap the map instead.");
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
    setSearchError("");
    setShowPinMap(true);
  }

  function applyCoords(raw: string) {
    const parsed = parseLatLng(raw);
    if (!parsed) {
      setCoordsError("Use lat, lng — e.g. 19.1197, 72.8468 (from Google/Apple Maps share).");
      return;
    }
    setCoordsError("");
    onChange({
      ...value,
      lat: parsed.lat,
      lng: parsed.lng,
      placeId: null,
    });
    setShowPinMap(true);
  }

  function clearCoords() {
    onChange({
      ...value,
      lat: null,
      lng: null,
      placeId: null,
    });
    setCoordsText("");
    setCoordsError("");
  }

  function setPin(lat: number, lng: number) {
    onChange({
      ...value,
      lat,
      lng,
      placeId: null,
    });
    setCoordsText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setCoordsError("");
  }

  const fallback = fallbackForCity(value.city, defaultCity);
  const hasPin = value.lat != null && value.lng != null;

  return (
    <div ref={wrapRef} className="space-y-3">
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
            placeholder="Search area, building, street…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              search(e.target.value);
            }}
            onFocus={() => hits.length && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) {
                e.preventDefault();
                pick(hits[0]);
              }
            }}
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

      {/* In-flow list — absolute dropdown gets clipped by modal overflow */}
      {open && hits.length > 0 && (
        <ul
          id={listId}
          className="max-h-48 overflow-auto rounded-[8px] border border-accent/40 bg-paper shadow-[0_8px_24px_rgba(16,20,24,0.1)]"
          role="listbox"
        >
          {hits.map((hit, i) => (
            <li key={hit.placeId}>
              <button
                type="button"
                className="w-full border-b border-line px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-accent-soft/50"
                onClick={() => pick(hit)}
              >
                <div className="font-semibold text-ink line-clamp-1">
                  {hit.community || hit.label.split(",")[0]}
                  {i === 0 && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-accent">
                      Enter
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted line-clamp-2">{hit.label}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchError && <p className="text-xs text-muted">{searchError}</p>}

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
                // Editing labels after a search pick drops that pin; map/coords pins stay.
                ...(value.placeId
                  ? { placeId: null, lat: null, lng: null, address: "" }
                  : { placeId: null }),
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
                ...(value.placeId
                  ? { placeId: null, lat: null, lng: null, address: "" }
                  : { placeId: null }),
              })
            }
            placeholder={defaultCity || "City"}
          />
        </label>
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <div className="flex min-h-[30px] items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            Map pin
          </span>
          <div className="flex items-center gap-2">
            {hasPin && (
              <>
                <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-accent">
                  <MapPin size={12} />
                  {value.lat!.toFixed(5)}, {value.lng!.toFixed(5)}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-muted hover:text-ink"
                  onClick={clearCoords}
                >
                  Clear
                </button>
              </>
            )}
            {!showPinMap && (
              <button
                type="button"
                className="text-xs font-semibold text-accent hover:underline"
                onClick={() => setShowPinMap(true)}
              >
                {hasPin ? "Adjust on map" : "Drop pin"}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            className="field min-w-0 flex-1 py-1.5 text-sm"
            placeholder="Paste coordinates, e.g. 19.1197, 72.8468"
            aria-label="Paste coordinates"
            value={coordsText}
            onChange={(e) => {
              setCoordsText(e.target.value);
              setCoordsError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyCoords(coordsText);
              }
            }}
            inputMode="decimal"
            autoComplete="off"
          />
          <button
            type="button"
            className="shrink-0 text-xs font-semibold text-accent hover:underline"
            onClick={() => applyCoords(coordsText)}
          >
            Set pin
          </button>
        </div>

        {coordsError ? (
          <p className="text-xs text-[var(--danger)]">{coordsError}</p>
        ) : (
          !hasPin && (
            <p className="text-[11px] text-muted">
              Optional. A pin places this listing on the Map.
            </p>
          )
        )}

        {showPinMap && (
          <ClickPinMap
            lat={value.lat}
            lng={value.lng}
            fallbackCenter={fallback}
            onPin={setPin}
            height={200}
          />
        )}
      </div>
    </div>
  );
}
