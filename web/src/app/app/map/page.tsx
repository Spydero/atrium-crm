"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { api, formatAed } from "@/lib/api";
import { InventoryMap, type MapPin as Pin } from "@/components/ListingMap";

type Listing = {
  id: string;
  title: string;
  community: string;
  city: string;
  priceAed: number;
  beds: number;
  status: string;
  lat?: number | null;
  lng?: number | null;
  coverUrl?: string | null;
};

export default function MapPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Listing[]>("/api/listings")
      .then(setListings)
      .catch((e) => {
        if (e instanceof Error && /session expired|unauthorized/i.test(e.message)) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      });
  }, []);

  const pinned = useMemo(
    () => listings.filter((l) => l.lat != null && l.lng != null),
    [listings],
  );

  const pins: Pin[] = useMemo(
    () =>
      pinned.map((l) => ({
        id: l.id,
        lat: l.lat as number,
        lng: l.lng as number,
        title: l.title,
        subtitle: [l.community, l.city].filter(Boolean).join(", "),
      })),
    [pinned],
  );

  const selected = listings.find((l) => l.id === selectedId) || pinned[0] || null;

  if (error) return <p className="text-[var(--danger)]">{error}</p>;

  return (
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            Inventory
          </div>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-[-0.03em]">Map</h1>
          <p className="mt-1 text-sm text-muted">
            {pinned.length} of {listings.length} listings have map pins (OpenStreetMap).
          </p>
        </div>
        <Link href="/app/listings" className="btn-ghost text-sm">
          Open listings
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="surface overflow-hidden p-2">
          {listings.length === 0 ? (
            <div className="flex h-[480px] items-center justify-center text-sm text-muted">
              Loading map…
            </div>
          ) : pins.length === 0 ? (
            <div className="flex h-[480px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
              <MapPin size={22} />
              No pinned listings yet. Add a listing and pick a place from search to drop a pin.
            </div>
          ) : (
            <InventoryMap
              pins={pins}
              height={520}
              onSelect={(id) => setSelectedId(id)}
            />
          )}
        </div>

        <div className="space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            On the map
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {pinned.map((l) => {
              const on = selected?.id === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedId(l.id)}
                  className={`w-full rounded-[10px] border px-3 py-3 text-left transition ${
                    on
                      ? "border-accent bg-accent-soft/40"
                      : "border-line bg-paper hover:border-accent/40"
                  }`}
                >
                  <div className="text-sm font-bold">{l.title}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {[l.community, l.city].filter(Boolean).join(", ")}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-ink">
                    {formatAed(l.priceAed)} · {l.beds} bed
                  </div>
                </button>
              );
            })}
            {pinned.length === 0 && (
              <p className="text-sm text-muted">Pinned inventory will show here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
