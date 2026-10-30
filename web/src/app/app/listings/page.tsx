"use client";

import { useCallback, useEffect, useState } from "react";
import { api, formatAed, portalLabel, PORTALS } from "@/lib/api";
import { StockPhotoPicker } from "@/components/StockPhotoPicker";

type Portal = { portal: string; status: string };
type Listing = {
  id: string;
  title: string;
  community: string;
  city: string;
  priceAed: number;
  beds: number;
  baths: number;
  areaSqft: number;
  status: string;
  propertyType: string;
  coverUrl?: string | null;
  portals: Portal[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [q, setQ] = useState("");
  const [beds, setBeds] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [community, setCommunity] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [testingEnabled, setTestingEnabled] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    community: "",
    city: "",
    priceAed: 0,
    beds: 2,
    baths: 2,
    areaSqft: 1000,
    coverUrl: "" as string,
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
    api<{ testingEnabled: boolean }>("/api/testing/status")
      .then((s) => setTestingEnabled(s.testingEnabled))
      .catch(() => setTestingEnabled(false));
  }, [load]);

  async function createListing(e: React.FormEvent) {
    e.preventDefault();
    const created = await api<Listing>("/api/listings", {
      method: "POST",
      body: JSON.stringify({
        title: form.title,
        community: form.community,
        city: form.city || undefined,
        priceAed: form.priceAed,
        beds: form.beds,
        baths: form.baths,
        areaSqft: form.areaSqft,
        coverUrl: form.coverUrl || null,
        photoUrls: form.coverUrl ? [form.coverUrl] : [],
        status: "ACTIVE",
        propertyType: "APARTMENT",
      }),
    });
    setShowCreate(false);
    setForm({
      title: "",
      community: "",
      city: "",
      priceAed: 0,
      beds: 2,
      baths: 2,
      areaSqft: 1000,
      coverUrl: "",
    });
    await load();
    setSelected(created);
  }

  async function uploadPhoto(listingId: string, file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("photo", file);
      const res = await fetch(`${API}/api/listings/${listingId}/photos`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) throw new Error("Upload failed");
      const updated = (await res.json()) as Listing;
      setSelected(updated);
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function publish(listingId: string, portal: string, status: string) {
    const updated = await api<Listing>(`/api/listings/${listingId}/publish`, {
      method: "POST",
      body: JSON.stringify({ portal, status }),
    });
    setSelected(updated);
    setTimeout(() => {
      load().then(() => {
        api<Listing>(`/api/listings/${listingId}`).then(setSelected);
      });
    }, 1400);
    await load();
  }

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">
          Listings
        </h1>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
          Add listing
        </button>
      </div>

      <div className="surface flex flex-wrap gap-2 p-2.5">
        <input
          className="field min-w-[160px] flex-1"
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="field w-28"
          placeholder="Min price"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
        />
        <input
          className="field w-28"
          placeholder="Max price"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />
        <input
          className="field w-20"
          placeholder="Beds"
          value={beds}
          onChange={(e) => setBeds(e.target.value)}
        />
        <input
          className="field w-36"
          placeholder="Area / community"
          value={community}
          onChange={(e) => setCommunity(e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {listings.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setSelected(l)}
            className="surface overflow-hidden text-left transition hover:border-ink/20"
          >
            <div
              className="h-40 bg-[#dfe3e8] bg-cover bg-center"
              style={
                l.coverUrl
                  ? { backgroundImage: `url(${l.coverUrl})` }
                  : undefined
              }
            />
            <div className="p-3.5">
              <div className="font-bold">{l.title}</div>
              <div className="mt-0.5 text-sm text-muted">
                {[l.community, l.city].filter(Boolean).join(", ")} · {l.beds} bed ·{" "}
                {l.areaSqft} sqft
              </div>
              <div className="font-display mt-2 text-lg font-bold tracking-[-0.02em]">
                {formatAed(l.priceAed)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {l.portals
                  .filter((p) => p.status !== "OFF")
                  .map((p) => (
                    <span
                      key={p.portal}
                      className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent"
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
        <div className="animate-fade surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold tracking-[-0.03em]">
                {selected.title}
              </h2>
              <p className="text-sm text-muted">
                {[selected.community, selected.city].filter(Boolean).join(", ")} ·{" "}
                {selected.status} · {formatAed(selected.priceAed)}
              </p>
            </div>
            <button
              type="button"
              className="text-sm font-semibold text-muted"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="btn-ghost cursor-pointer">
              {uploading ? "Uploading…" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhoto(selected.id, file);
                }}
              />
            </label>
            {testingEnabled && (
              <span className="text-xs text-muted">
                Or set cover from test stock when creating a listing.
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PORTALS.map((portal) => {
              const row = selected.portals.find((p) => p.portal === portal);
              const status = row?.status || "OFF";
              return (
                <div key={portal} className="rounded-[var(--radius)] border border-line p-3">
                  <div className="text-sm font-bold">{portalLabel(portal)}</div>
                  <div className="mt-1 text-xs text-muted">{status}</div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="btn-primary px-2.5 py-1.5 text-xs"
                      onClick={() => publish(selected.id, portal, "LIVE")}
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      className="btn-ghost px-2.5 py-1.5 text-xs"
                      onClick={() => publish(selected.id, portal, "OFF")}
                    >
                      Off
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={createListing}
            className="surface max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-6"
          >
            <h3 className="font-display text-lg font-bold">New listing</h3>
            <input
              className="field"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="field"
                placeholder="Community / area"
                value={form.community}
                onChange={(e) => setForm({ ...form, community: e.target.value })}
                required
              />
              <input
                className="field"
                placeholder="City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <input
              type="number"
              className="field"
              placeholder="Price"
              value={form.priceAed || ""}
              onChange={(e) => setForm({ ...form, priceAed: Number(e.target.value) })}
              required
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                className="field"
                placeholder="Beds"
                value={form.beds}
                onChange={(e) => setForm({ ...form, beds: Number(e.target.value) })}
              />
              <input
                type="number"
                className="field"
                placeholder="Baths"
                value={form.baths}
                onChange={(e) => setForm({ ...form, baths: Number(e.target.value) })}
              />
              <input
                type="number"
                className="field"
                placeholder="Sqft"
                value={form.areaSqft}
                onChange={(e) => setForm({ ...form, areaSqft: Number(e.target.value) })}
              />
            </div>

            {form.coverUrl && (
              <div
                className="h-28 rounded-[var(--radius)] bg-cover bg-center"
                style={{ backgroundImage: `url(${form.coverUrl})` }}
              />
            )}

            {testingEnabled ? (
              <StockPhotoPicker
                selectedUrl={form.coverUrl || null}
                onSelect={(url) => setForm({ ...form, coverUrl: url })}
              />
            ) : (
              <p className="text-xs text-muted">
                Set TESTING_ENABLED=true to pick stock photos while testing. You can upload
                after create.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
