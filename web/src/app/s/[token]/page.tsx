"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE, formatMoney } from "@/lib/api";
import { ListingMap } from "@/components/ListingMap";

type PublicShortlist = {
  title: string;
  clientName: string | null;
  organization: { name: string; currencyLabel?: string };
  items: {
    listing: {
      id: string;
      title: string;
      priceAed: number;
      beds: number;
      baths: number;
      areaSqft: number;
      community: string;
      city?: string | null;
      coverUrl: string | null;
      propertyType: string;
      description: string;
      lat?: number | null;
      lng?: number | null;
    };
  }[];
};

export default function PublicShortlistPage() {
  const { token } = useParams<{ token: string }>();
  const [result, setResult] = useState<{ token: string; data?: PublicShortlist; error?: string } | null>(null);
  const data = result?.token === token ? result.data : undefined;
  const error = result?.token === token ? result.error : undefined;
  const [minBeds, setMinBeds] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/api/shortlists/public/${encodeURIComponent(token)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (response.status === 404) return { token, error: "This shortlist link is unavailable." };
        if (!response.ok) throw new Error("Could not load the shortlist.");
        return { token, data: await response.json() as PublicShortlist };
      })
      .then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ token, error: "Could not load the shortlist. Refresh the page to try again." });
      });
    return () => controller.abort();
  }, [token]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.items.filter(({ listing }) => {
      if (minBeds && listing.beds < minBeds) return false;
      if (maxPrice && listing.priceAed > maxPrice) return false;
      return true;
    });
  }, [data, minBeds, maxPrice]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        <p role="status">{error || "Loading shortlist…"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e8ecf0] px-4 py-10">
      <div className="mx-auto max-w-5xl animate-rise">
        <div className="mb-7">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {data.organization.name}
          </div>
          <h1 className="font-display mt-1 text-4xl font-bold tracking-[-0.04em]">
            {data.title}
          </h1>
          {data.clientName && (
            <p className="mt-1 text-muted">For {data.clientName}</p>
          )}
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <select
            className="field w-auto"
            value={minBeds}
            onChange={(e) => setMinBeds(Number(e.target.value))}
          >
            <option value={0}>Any beds</option>
            <option value={1}>1+ beds</option>
            <option value={2}>2+ beds</option>
            <option value={3}>3+ beds</option>
          </select>
          <select
            className="field w-auto"
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
          >
            <option value={0}>Any price</option>
            <option value={2000000}>Under 2M</option>
            <option value={5000000}>Under 5M</option>
            <option value={10000000}>Under 10M</option>
          </select>
        </div>

        {filtered.length === 0 && (
          <p className="surface p-4 text-sm text-muted">
            {data.items.length ? "No properties match those filters." : "There are no properties on this shortlist."}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ listing }) => (
            <article key={listing.id} className="surface overflow-hidden">
              <div
                className="h-44 bg-cover bg-center"
                style={{
                  backgroundImage: `url(${listing.coverUrl || "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"})`,
                }}
              />
              <div className="p-4">
                <h2 className="font-bold">{listing.title}</h2>
                <p className="text-sm text-muted">
                  {[listing.community, listing.city].filter(Boolean).join(", ")} ·{" "}
                  {listing.beds} bed · {listing.areaSqft} sqft
                </p>
                <p className="font-display mt-2 text-xl font-bold tracking-[-0.02em]">
                  {formatMoney(listing.priceAed, data.organization.currencyLabel)}
                </p>
                {listing.lat != null && listing.lng != null && (
                  <div className="mt-3">
                    <ListingMap
                      lat={listing.lat}
                      lng={listing.lng}
                      label={listing.title}
                      height={140}
                    />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
