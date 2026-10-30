"use client";

import { useCallback, useEffect, useState } from "react";
import { BedDouble, Bath, Maximize2, MapPin } from "lucide-react";
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

function livePortalCount(portals: Portal[]) {
  return portals.filter((p) => p.status === "LIVE").length;
}

function statusClass(status: string) {
  if (status === "ACTIVE") return "bg-accent-soft text-accent";
  if (status === "DRAFT") return "bg-[#eef1f4] text-muted";
  if (status === "SOLD" || status === "RESERVED") return "bg-mark-soft text-mark";
  return "bg-[#eef1f4] text-muted";
}

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">
            Listings
          </h1>
          <p className="mt-0.5 text-sm text-muted">{listings.length} properties</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
          Add listing
        </button>
      </div>

      <div className="toolbar">
        <input
          className="field min-w-0 flex-1"
          style={{ minWidth: 200 }}
          placeholder="Search title or area"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className="field shrink-0"
          style={{ width: 112 }}
          placeholder="Min price"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
        />
        <input
          className="field shrink-0"
          style={{ width: 112 }}
          placeholder="Max price"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />
        <input
          className="field shrink-0"
          style={{ width: 72 }}
          placeholder="Beds"
          value={beds}
          onChange={(e) => setBeds(e.target.value)}
        />
        <input
          className="field shrink-0"
          style={{ width: 150 }}
          placeholder="Community"
          value={community}
          onChange={(e) => setCommunity(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {listings.map((l) => {
          const live = livePortalCount(l.portals);
          const place = [l.community, l.city].filter(Boolean).join(", ");
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelected(l)}
              className="group overflow-hidden rounded-[var(--radius)] border border-line bg-paper text-left transition hover:border-ink/20 hover:shadow-[0_8px_24px_rgba(16,20,24,0.06)]"
            >
              <div className="relative h-[168px] overflow-hidden bg-[#dfe3e8]">
                {l.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.coverUrl}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                ) : null}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
                <span
                  className={`status-chip absolute left-2.5 top-2.5 ${statusClass(l.status)}`}
                >
                  {l.status}
                </span>
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-2">
                  <div className="font-display text-lg font-bold tracking-[-0.02em] text-white drop-shadow">
                    {formatAed(l.priceAed)}
                  </div>
                  {live > 0 && (
                    <span className="rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                      {live} live
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 p-3.5">
                <div>
                  <div className="line-clamp-1 text-[15px] font-bold leading-snug">
                    {l.title}
                  </div>
                  {place && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                      <MapPin size={12} strokeWidth={2} />
                      <span className="line-clamp-1">{place}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 border-t border-line pt-2.5">
                  <span className="meta-pill">
                    <BedDouble size={13} strokeWidth={1.75} />
                    {l.beds}
                  </span>
                  <span className="meta-pill">
                    <Bath size={13} strokeWidth={1.75} />
                    {l.baths}
                  </span>
                  <span className="meta-pill">
                    <Maximize2 size={13} strokeWidth={1.75} />
                    {l.areaSqft.toLocaleString()}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="animate-fade surface overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
            <div className="relative min-h-[200px] bg-[#dfe3e8]">
              {selected.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.coverUrl}
                  alt=""
                  className="h-full max-h-[280px] w-full object-cover lg:max-h-none lg:absolute lg:inset-0"
                />
              ) : null}
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`status-chip ${statusClass(selected.status)}`}>
                      {selected.status}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                      {selected.propertyType}
                    </span>
                  </div>
                  <h2 className="font-display mt-2 text-xl font-bold tracking-[-0.03em]">
                    {selected.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {[selected.community, selected.city].filter(Boolean).join(", ")}
                  </p>
                  <p className="font-display mt-2 text-2xl font-bold tracking-[-0.03em]">
                    {formatAed(selected.priceAed)}
                  </p>
                  <div className="mt-3 flex gap-4">
                    <span className="meta-pill">
                      <BedDouble size={14} /> {selected.beds} bed
                    </span>
                    <span className="meta-pill">
                      <Bath size={14} /> {selected.baths} bath
                    </span>
                    <span className="meta-pill">
                      <Maximize2 size={14} /> {selected.areaSqft.toLocaleString()} sqft
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="text-sm font-semibold text-muted"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <label className="btn-ghost cursor-pointer text-sm">
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
              </div>

              <div className="mt-5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Portals
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PORTALS.map((portal) => {
                    const row = selected.portals.find((p) => p.portal === portal);
                    const status = row?.status || "OFF";
                    return (
                      <div
                        key={portal}
                        className="flex items-center justify-between gap-2 rounded-[8px] border border-line px-3 py-2.5"
                      >
                        <div>
                          <div className="text-sm font-bold">{portalLabel(portal)}</div>
                          <div className="text-xs text-muted">{status}</div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            className="btn-primary px-2 py-1 text-[11px]"
                            onClick={() => publish(selected.id, portal, "LIVE")}
                          >
                            Live
                          </button>
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1 text-[11px]"
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
            </div>
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
              className="field w-full"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="field w-full"
                placeholder="Community / area"
                value={form.community}
                onChange={(e) => setForm({ ...form, community: e.target.value })}
                required
              />
              <input
                className="field w-full"
                placeholder="City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <input
              type="number"
              className="field w-full"
              placeholder="Price"
              value={form.priceAed || ""}
              onChange={(e) => setForm({ ...form, priceAed: Number(e.target.value) })}
              required
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                className="field w-full"
                placeholder="Beds"
                value={form.beds}
                onChange={(e) => setForm({ ...form, beds: Number(e.target.value) })}
              />
              <input
                type="number"
                className="field w-full"
                placeholder="Baths"
                value={form.baths}
                onChange={(e) => setForm({ ...form, baths: Number(e.target.value) })}
              />
              <input
                type="number"
                className="field w-full"
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
                Upload a photo after create, or enable TESTING_ENABLED for stock picks.
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
