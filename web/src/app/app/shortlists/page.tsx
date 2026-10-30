"use client";

import { useEffect, useState } from "react";
import { api, formatAed } from "@/lib/api";

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
  const [title, setTitle] = useState("Client shortlist");
  const [clientName, setClientName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [createdUrl, setCreatedUrl] = useState("");

  useEffect(() => {
    Promise.all([
      api<Shortlist[]>("/api/shortlists"),
      api<Listing[]>("/api/listings"),
    ]).then(([s, l]) => {
      setList(s);
      setListings(l);
    });
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!picked.length) return;
    const s = await api<{ token: string }>("/api/shortlists", {
      method: "POST",
      body: JSON.stringify({ title, clientName, listingIds: picked }),
    });
    const url = `${window.location.origin}/s/${s.token}`;
    setCreatedUrl(url);
    const refreshed = await api<Shortlist[]>("/api/shortlists");
    setList(refreshed);
    setPicked([]);
  }

  return (
    <div className="animate-rise space-y-4">
      <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">
        Shortlists
      </h1>

      <form onSubmit={create} className="surface space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
          />
          <input
            className="field"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client name"
          />
        </div>
        <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
          {listings.map((l) => {
            const on = picked.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() =>
                  setPicked((p) => (on ? p.filter((id) => id !== l.id) : [...p, l.id]))
                }
                className={`rounded-[var(--radius)] border px-3 py-2 text-left text-sm ${
                  on ? "border-accent bg-accent-soft" : "border-line"
                }`}
              >
                <div className="font-bold">{l.title}</div>
                <div className="text-xs text-muted">
                  {l.community} · {formatAed(l.priceAed)}
                </div>
              </button>
            );
          })}
        </div>
        <button type="submit" className="btn-primary">
          Create share link
        </button>
        {createdUrl && (
          <p className="break-all rounded-[var(--radius)] bg-accent-soft px-3 py-2 text-sm text-accent">
            {createdUrl}
          </p>
        )}
      </form>

      <div className="space-y-2">
        {list.map((s) => (
          <div
            key={s.id}
            className="surface flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <div>
              <div className="font-bold">{s.title}</div>
              <div className="text-xs text-muted">
                {s.clientName || "No client"} · {s._count.items} homes · {s.openCount} opens
              </div>
            </div>
            <a className="btn-ghost" href={`/s/${s.token}`} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
