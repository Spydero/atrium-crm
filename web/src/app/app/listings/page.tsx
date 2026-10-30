"use client";

import { useCallback, useEffect, useState } from "react";
import { api, formatAed, portalLabel, PORTALS } from "@/lib/api";

type Portal = { portal: string; status: string };
type Listing = {
  id: string;
  title: string;
  community: string;
  priceAed: number;
  beds: number;
  baths: number;
  areaSqft: number;
  status: string;
  propertyType: string;
  coverUrl?: string | null;
  portals: Portal[];
};

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [q, setQ] = useState("");
  const [beds, setBeds] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [community, setCommunity] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    community: "Dubai Marina",
    priceAed: 2000000,
    beds: 2,
    baths: 2,
    areaSqft: 1200,
  });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (beds) params.set("beds", beds);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (community) params.set("community", community);
    const data = await api<Listing[]>(`/api/listings?${params}`);
    setListings(data);
  }, [q, beds, minPrice, maxPrice, community]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  async function createListing(e: React.FormEvent) {
    e.preventDefault();
    const created = await api<Listing>("/api/listings", {
      method: "POST",
      body: JSON.stringify({ ...form, status: "ACTIVE", propertyType: "APARTMENT" }),
    });
    setShowCreate(false);
    await load();
    setSelected(created);
  }

  async function publish(listingId: string, portal: string, status: string) {
    const updated = await api<Listing>(`/api/listings/${listingId}/publish`, {
      method: "POST",
      body: JSON.stringify({ portal, status }),
    });
    setSelected(updated);
    setTimeout(() => load().then(() => {
      api<Listing>(`/api/listings/${listingId}`).then(setSelected);
    }), 1400);
    await load();
  }

  return (
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Listings</h1>
          <p className="text-muted">Inventory with filters and mock multi-portal publish.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-cove px-4 py-2.5 text-sm font-semibold text-white"
        >
          + Add listing
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-line bg-paper p-3">
        <input
          className="min-w-[180px] flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
          placeholder="Search title, community…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="w-28 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
          placeholder="Min AED"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
        />
        <input
          className="w-28 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
          placeholder="Max AED"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />
        <input
          className="w-20 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
          placeholder="Beds"
          value={beds}
          onChange={(e) => setBeds(e.target.value)}
        />
        <input
          className="w-40 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
          placeholder="Community"
          value={community}
          onChange={(e) => setCommunity(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {listings.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setSelected(l)}
            className="overflow-hidden rounded-2xl border border-line bg-paper text-left transition hover:border-cove/40"
          >
            <div
              className="h-40 bg-cover bg-center"
              style={{
                backgroundImage: `url(${l.coverUrl || "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800"})`,
              }}
            />
            <div className="p-4">
              <div className="font-semibold">{l.title}</div>
              <div className="text-sm text-muted">
                {l.community} · {l.beds} bed · {l.areaSqft} sqft
              </div>
              <div className="mt-2 font-display text-lg font-bold">{formatAed(l.priceAed)}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {l.portals
                  .filter((p) => p.status !== "OFF")
                  .map((p) => (
                    <span
                      key={p.portal}
                      className="rounded-md bg-cove-soft px-1.5 py-0.5 text-[10px] font-semibold text-cove"
                    >
                      {portalLabel(p.portal)} · {p.status}
                    </span>
                  ))}
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="animate-fade rounded-2xl border border-line bg-paper p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">{selected.title}</h2>
              <p className="text-sm text-muted">
                {selected.community} · {selected.status} · {formatAed(selected.priceAed)}
              </p>
            </div>
            <button type="button" className="text-sm text-muted" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PORTALS.map((portal) => {
              const row = selected.portals.find((p) => p.portal === portal);
              const status = row?.status || "OFF";
              return (
                <div key={portal} className="rounded-xl border border-line p-3">
                  <div className="font-semibold">{portalLabel(portal)}</div>
                  <div className="mt-1 text-xs text-muted">Status: {status}</div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-cove px-2 py-1 text-xs font-semibold text-white"
                      onClick={() => publish(selected.id, portal, "LIVE")}
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-line px-2 py-1 text-xs font-semibold"
                      onClick={() => publish(selected.id, portal, "OFF")}
                    >
                      Unpublish
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={createListing}
            className="w-full max-w-md space-y-3 rounded-2xl bg-paper p-6 shadow-xl"
          >
            <h3 className="font-display text-lg font-bold">New listing</h3>
            {(["title", "community"] as const).map((k) => (
              <input
                key={k}
                className="w-full rounded-xl border border-line px-3 py-2"
                placeholder={k}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                required
              />
            ))}
            <input
              type="number"
              className="w-full rounded-xl border border-line px-3 py-2"
              placeholder="Price AED"
              value={form.priceAed}
              onChange={(e) => setForm({ ...form, priceAed: Number(e.target.value) })}
              required
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                className="rounded-xl border border-line px-3 py-2"
                placeholder="Beds"
                value={form.beds}
                onChange={(e) => setForm({ ...form, beds: Number(e.target.value) })}
              />
              <input
                type="number"
                className="rounded-xl border border-line px-3 py-2"
                placeholder="Baths"
                value={form.baths}
                onChange={(e) => setForm({ ...form, baths: Number(e.target.value) })}
              />
              <input
                type="number"
                className="rounded-xl border border-line px-3 py-2"
                placeholder="Sqft"
                value={form.areaSqft}
                onChange={(e) => setForm({ ...form, areaSqft: Number(e.target.value) })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm">
                Cancel
              </button>
              <button type="submit" className="rounded-xl bg-cove px-4 py-2 text-sm font-semibold text-white">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
