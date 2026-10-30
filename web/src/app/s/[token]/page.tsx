"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { formatAed } from "@/lib/api";

type PublicShortlist = {
  title: string;
  clientName: string | null;
  organization: { name: string };
  items: {
    listing: {
      id: string;
      title: string;
      priceAed: number;
      beds: number;
      baths: number;
      areaSqft: number;
      community: string;
      coverUrl: string | null;
      propertyType: string;
      description: string;
    };
  }[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function PublicShortlistPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicShortlist | null>(null);
  const [minBeds, setMinBeds] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);

  useEffect(() => {
    fetch(`${API}/api/shortlists/public/${token}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
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
        Loading shortlist…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_400px_at_10%_-10%,#dfe8e4,transparent),#f3f4f6] px-4 py-10">
      <div className="mx-auto max-w-5xl animate-rise">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {data.organization.name}
          </div>
          <h1 className="font-display mt-1 text-4xl font-bold tracking-tight">
            {data.title}
          </h1>
          {data.clientName && (
            <p className="mt-1 text-muted">Prepared for {data.clientName}</p>
          )}
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <select
            className="rounded-xl border border-line bg-paper px-3 py-2 text-sm"
            value={minBeds}
            onChange={(e) => setMinBeds(Number(e.target.value))}
          >
            <option value={0}>Any beds</option>
            <option value={1}>1+ beds</option>
            <option value={2}>2+ beds</option>
            <option value={3}>3+ beds</option>
          </select>
          <select
            className="rounded-xl border border-line bg-paper px-3 py-2 text-sm"
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
          >
            <option value={0}>Any price</option>
            <option value={2000000}>Under 2M</option>
            <option value={5000000}>Under 5M</option>
            <option value={10000000}>Under 10M</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ listing }) => (
            <article
              key={listing.id}
              className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_12px_40px_rgba(18,20,26,0.06)]"
            >
              <div
                className="h-44 bg-cover bg-center"
                style={{
                  backgroundImage: `url(${listing.coverUrl || "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"})`,
                }}
              />
              <div className="p-4">
                <h2 className="font-semibold">{listing.title}</h2>
                <p className="text-sm text-muted">
                  {listing.community} · {listing.beds} bed · {listing.areaSqft} sqft
                </p>
                <p className="font-display mt-2 text-xl font-bold">
                  {formatAed(listing.priceAed)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
