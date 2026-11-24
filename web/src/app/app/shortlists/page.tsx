"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api, formatMoney, type OrgSettings } from "@/lib/api";

type Listing = { id: string; title: string; priceAed: number; community: string };
type Shortlist = {
  id: string;
  title: string;
  token: string;
  clientName: string | null;
  openCount: number;
  _count: { items: number };
};

export default function ShortlistsPage() {
  const [list, setList] = useState<Shortlist[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [currency, setCurrency] = useState("AED");
  const [title, setTitle] = useState("Client shortlist");
  const [clientName, setClientName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Shortlist[]>("/api/shortlists"),
      api<Listing[]>("/api/listings"),
    ]).then(([shortlists, properties]) => {
      if (!active) return;
      setList(shortlists);
      setListings(properties);
    }).catch(() => {
      if (active) setError("Could not load shortlists and properties. Refresh the page to try again.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    api<OrgSettings>("/api/settings").then(settings => {
      if (active) setCurrency(settings.currencyLabel || settings.currencyCode || "AED");
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picked.length || !title.trim() || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const shortlist = await api<Shortlist>("/api/shortlists", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), clientName: clientName.trim(), listingIds: picked }),
      });
      setShareUrl(new URL(`/s/${shortlist.token}`, window.location.origin).href);
      setList(current => [shortlist, ...current]);
      setPicked([]);
      setNotice("Share link created.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the share link. Try again.");
    } finally { setSaving(false); }
  }

  async function copy(token?: string) {
    const url = token ? new URL(`/s/${token}`, window.location.origin).href : shareUrl;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Share link copied.");
    } catch {
      setNotice("Select and copy the share link manually.");
    }
  }

  return (
    <div className="animate-rise space-y-4">
      <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">Shortlists</h1>

      <form onSubmit={create} className="surface space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Shortlist title
            <input className="field mt-1 w-full" required maxLength={120} value={title}
              onChange={event => setTitle(event.target.value)} disabled={saving} />
          </label>
          <label className="text-sm font-medium">
            Client name (optional)
            <input className="field mt-1 w-full" maxLength={120} value={clientName}
              onChange={event => setClientName(event.target.value)} disabled={saving} />
          </label>
        </div>
        <fieldset disabled={saving} className="space-y-2">
          <legend className="text-sm font-semibold">Select properties</legend>
          {loading ? <p className="text-sm text-muted">Loading properties…</p>
            : !listings.length && !error && <p className="text-sm text-muted">Add a listing before creating a shortlist.</p>}
          <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
            {listings.map(listing => {
              const selected = picked.includes(listing.id);
              return (
                <label key={listing.id} className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border px-3 py-2 text-sm ${selected ? "border-accent bg-accent-soft" : "border-line"}`}>
                  <input type="checkbox" className="accent-[var(--accent)]" checked={selected} onChange={() =>
                    setPicked(current => current.includes(listing.id) ? current.filter(id => id !== listing.id) : [...current, listing.id])
                  } />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{listing.title}</span>
                    <span className="block text-xs text-muted">{listing.community} · {formatMoney(listing.priceAed, currency)}</span>
                  </span>
                  {selected && <Check size={16} className="shrink-0 text-accent" aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary disabled:opacity-50" disabled={saving || !picked.length || !title.trim()}>
            {saving ? "Creating…" : "Create share link"}
          </button>
          <span className="text-sm text-muted" aria-live="polite">
            {picked.length ? `${picked.length} selected` : "Select at least one property to continue."}
          </span>
        </div>
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      </form>

      {shareUrl && (
        <section className="surface space-y-2 p-4" aria-label="Share shortlist">
          <p className="text-sm text-muted">Anyone with this link can view the shortlist.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className="field min-w-0 flex-1" aria-label="Shortlist share link" readOnly value={shareUrl}
              onFocus={event => event.currentTarget.select()} />
            <button className="btn-primary" type="button" onClick={() => void copy()}>Copy link</button>
            <a className="btn-ghost" href={shareUrl} target="_blank" rel="noreferrer">Open client view</a>
          </div>
          {notice && <p className="text-sm text-muted" role="status">{notice}</p>}
        </section>
      )}

      {list.length > 0 && (
        <section className="space-y-2" aria-label="Saved shortlists">
          <h2 className="font-display text-lg font-bold">Saved shortlists</h2>
          {list.map(shortlist => (
            <div key={shortlist.id} className="surface flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <div className="font-bold">{shortlist.title}</div>
                <div className="text-xs text-muted">
                  {shortlist.clientName ? `${shortlist.clientName} · ` : ""}{shortlist._count.items} {shortlist._count.items === 1 ? "property" : "properties"} · {shortlist.openCount} opens
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={() => void copy(shortlist.token)}
                  aria-label={`Copy link for ${shortlist.title}`}>Copy link</button>
                <a className="btn-ghost" href={`/s/${shortlist.token}`} target="_blank" rel="noreferrer">Open</a>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
