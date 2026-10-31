"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { api, formatMoney, type OrgSettings } from "@/lib/api";
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
  const [loading, setLoading] = useState(true);
  const [currencyLabel, setCurrencyLabel] = useState("AED");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api<Listing[]>("/api/listings"),
      api<OrgSettings>("/api/settings").catch(() => null),
    ])
      .then(([rows, settings]) => {
        if (cancelled) return;
        setListings(rows);
        if (settings?.currencyLabel) setCurrencyLabel(settings.currencyLabel);
        setError("");
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof Error && /session expired|unauthorized/i.test(e.message)) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  return (
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            Inventory
          </div>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-[-0.03em]">Map</h1>
          <p className="mt-1 text-sm text-muted">
            {loading
              ? "Loading inventory…"
              : `${pinned.length} of ${listings.length} listings have map pins (OpenStreetMap).`}
          </p>
        </div>
        <Link href="/app/listings" className="btn-ghost text-sm">
          Open listings
        </Link>
      </div>

      {error && (
        <div className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
          {error === "No organization" ? (
            <>
              This account is not linked to a brokerage yet. Accept an invite or ask an Atrium
              operator to provision your firm, then sign out and sign back in.
            </>
          ) : (
            error
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="surface overflow-hidden p-2">
          {loading ? (
            <div className="flex h-[480px] items-center justify-center text-sm text-muted">
              Loading map…
            </div>
          ) : error ? (
            <div className="flex h-[480px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
              <MapPin size={22} />
              Map unavailable until inventory can load.
            </div>
          ) : pins.length === 0 ? (
            <div className="flex h-[480px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
              <MapPin size={22} />
              {listings.length === 0
                ? "No listings yet. Add one from Listings and set a pin (search, paste coords, or tap the map)."
                : "No pinned listings yet. Open a listing and set a pin via search, coordinates, or the map."}
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
            Inventory
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {listings.map((l) => {
              const hasPin = l.lat != null && l.lng != null;
              const on = selected?.id === l.id;
              return (
                <div
                  key={l.id}
                  className={`w-full rounded-[10px] border px-3 py-3 text-left ${
                    on
                      ? "border-accent bg-accent-soft/40"
                      : "border-line bg-paper"
                  }`}
                >
                  {hasPin ? (
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelectedId(l.id)}
                    >
                      <div className="text-sm font-bold">{l.title}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {[l.community, l.city].filter(Boolean).join(", ")}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-ink">
                        {formatMoney(l.priceAed, currencyLabel)} · {l.beds} bed
                      </div>
                    </button>
                  ) : (
                    <>
                      <div className="text-sm font-bold">{l.title}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {[l.community, l.city].filter(Boolean).join(", ") || "No area set"}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-[#eef1f4] px-1.5 py-0.5 font-semibold text-muted">
                          No pin
                        </span>
                        <Link
                          href="/app/listings"
                          className="font-semibold text-accent hover:underline"
                        >
                          Add pin in Listings
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {!loading && !error && listings.length === 0 && (
              <p className="text-sm text-muted">Listings will show here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
