"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  ImageUp,
  Trash2,
} from "lucide-react";
import { API_BASE, api, downloadFile, pct } from "@/lib/api";
import { GuideCover, formatBytes } from "@/components/GuideBits";
import {
  AUDIENCES,
  AUDIENCE_NAME,
  STATUS_STYLE,
  type AdminGuide,
  type GuideStats,
} from "@/components/guideTypes";

type Detail = AdminGuide & { channels: { channel: string; requests: number }[]; stats: (GuideStats & { guideId: string }) | null };
type Agent = { id: string; name: string; role: string };
type RequestRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  leadId: string | null;
  consentMarketing: boolean;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  channel: string;
  downloadCount: number;
  createdAt: string;
  lead: { name: string; stage: string } | null;
};

const SOURCE_PRESETS = [
  { label: "Instagram", source: "instagram", medium: "social" },
  { label: "Facebook", source: "facebook", medium: "social" },
  { label: "Email newsletter", source: "newsletter", medium: "email" },
  { label: "WhatsApp", source: "whatsapp", medium: "share" },
  { label: "Open house QR", source: "open-house", medium: "qr" },
  { label: "Google ads", source: "google", medium: "cpc" },
];

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{children}</span>;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function GuideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [g, setG] = useState<Detail | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [orgSlug, setOrgSlug] = useState("");
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    audience: "GENERAL",
    summary: "",
    benefits: "",
    gated: true,
    ownerId: "",
    permitNumber: "",
    ctaText: "",
  });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [utm, setUtm] = useState({ source: "", medium: "", campaign: "" });
  const [copied, setCopied] = useState("");
  const [qr, setQr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const hydrate = useCallback((d: Detail) => {
    setG(d);
    setForm({
      title: d.title,
      subtitle: d.subtitle,
      audience: d.audience,
      summary: d.summary,
      benefits: d.benefits.join("\n"),
      gated: d.gated,
      ownerId: d.ownerId || "",
      permitNumber: d.permitNumber || "",
      ctaText: d.ctaText,
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const [d, a, r, s] = await Promise.all([
        api<Detail>(`/api/guides/${id}`),
        api<Agent[]>("/api/leads/agents"),
        api<RequestRow[]>(`/api/guides/${id}/requests`),
        api<{ slug: string }>("/api/settings"),
      ]);
      hydrate(d);
      setAgents(a);
      setRows(r);
      setOrgSlug(s.slug);
    } catch (e) {
      if (e instanceof Error && /session expired/i.test(e.message)) return;
      setError(e instanceof Error ? e.message : "Failed to load guide");
    }
  }, [id, hydrate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const baseUrl = g && orgSlug && typeof window !== "undefined" ? `${window.location.origin}/guides/${orgSlug}/${g.slug}` : "";
  const shareUrl = (() => {
    if (!baseUrl) return "";
    const u = new URL(baseUrl);
    if (utm.source) u.searchParams.set("utm_source", utm.source);
    if (utm.medium) u.searchParams.set("utm_medium", utm.medium);
    if (utm.campaign) u.searchParams.set("utm_campaign", utm.campaign);
    return u.toString();
  })();

  useEffect(() => {
    if (!shareUrl) return;
    QRCode.toDataURL(shareUrl, { width: 320, margin: 1, color: { dark: "#14213d", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [shareUrl]);

  function flash(m: string) {
    setMsg(m);
    setError("");
    setTimeout(() => setMsg(""), 4000);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    try {
      const updated = await api<AdminGuide>(`/api/guides/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          subtitle: form.subtitle,
          audience: form.audience,
          summary: form.summary,
          benefits: form.benefits
            .split("\n")
            .map((b) => b.trim())
            .filter(Boolean),
          gated: form.gated,
          ownerId: form.ownerId || null,
          permitNumber: form.permitNumber.trim() || null,
          ctaText: form.ctaText,
        }),
      });
      setG((prev) => (prev ? { ...prev, ...updated } : prev));
      flash("Changes saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function setStatus(status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
    setBusy(status);
    try {
      const updated = await api<AdminGuide>(`/api/guides/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setG((prev) => (prev ? { ...prev, ...updated } : prev));
      flash(status === "PUBLISHED" ? "Guide published" : status === "ARCHIVED" ? "Guide archived" : "Moved back to draft");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change status");
    } finally {
      setBusy("");
    }
  }

  async function upload(kind: "file" | "cover", file: File) {
    setBusy(kind);
    setError("");
    try {
      const body = new FormData();
      body.append(kind, file);
      const res = await fetch(`${API_BASE}/api/guides/${id}/${kind}`, {
        method: "POST",
        credentials: "include",
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setG((prev) => (prev ? { ...prev, ...json } : prev));
      flash(kind === "file" ? "PDF uploaded" : "Cover updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
      if (coverRef.current) coverRef.current.value = "";
    }
  }

  async function remove() {
    if (!confirm("Delete this guide? This cannot be undone.")) return;
    try {
      await api(`/api/guides/${id}`, { method: "DELETE" });
      router.push("/app/guides");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1800);
  }

  if (error && !g) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!g) return <div className="py-20 text-center text-muted">Loading…</div>;

  const s = g.stats;
  const canDelete = g.status !== "PUBLISHED" && (s?.requests ?? 0) === 0 && rows.length === 0;

  return (
    <div className="animate-rise space-y-5">
      <Link href="/app/guides" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft size={15} /> All guides
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.04em]">{g.title}</h1>
            <span className={`status-chip ${STATUS_STYLE[g.status]}`} data-testid="guide-status">
              {g.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Version {g.version}
            {g.publishedAt ? ` · first published ${new Date(g.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {g.status === "PUBLISHED" && baseUrl && (
            <a href={baseUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost inline-flex items-center gap-1.5">
              <ExternalLink size={14} /> View public page
            </a>
          )}
          {g.hasFile && (
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-1.5"
              onClick={() => downloadFile(`/api/guides/${id}/file`, `${g.slug}.pdf`)}
            >
              <Download size={14} /> Preview PDF
            </button>
          )}
          {g.status !== "PUBLISHED" && g.status !== "ARCHIVED" && (
            <button type="button" className="btn-primary" disabled={!!busy} onClick={() => setStatus("PUBLISHED")}>
              {busy === "PUBLISHED" ? "Publishing…" : "Publish"}
            </button>
          )}
          {g.status === "PUBLISHED" && (
            <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => setStatus("DRAFT")}>
              Unpublish
            </button>
          )}
          {g.status !== "ARCHIVED" ? (
            g.status === "PUBLISHED" && (
              <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => setStatus("ARCHIVED")}>
                Archive
              </button>
            )
          ) : (
            <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => setStatus("DRAFT")}>
              Restore to draft
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn-ghost inline-flex items-center gap-1.5 text-[var(--danger)]" onClick={remove}>
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p role="status" className="rounded-[8px] border border-accent/20 bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-[8px] border border-[var(--danger)]/25 bg-[#fdf1ef] px-3 py-2 text-sm font-medium text-[var(--danger)]">
          {error}
        </p>
      )}

      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Views", s.views, "last 90 days"],
            ["Requests", s.requests, `${pct(s.requestRate)} of views`],
            ["Downloads", s.totalDownloads, `${pct(s.downloadRate)} opened`],
            ["Leads", s.leads, "people"],
            ["Reached viewing", s.reachedViewing, `${s.won} won`],
          ].map(([label, value, note]) => (
            <div key={String(label)} className="surface px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{label}</div>
              <div className="font-display mt-1 text-2xl font-bold leading-none tracking-[-0.03em]">{value}</div>
              <div className="mt-1 text-xs text-muted">{note}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <form onSubmit={save} className="surface space-y-4 p-5">
          <h2 className="text-sm font-bold">Details</h2>
          <label className="block space-y-1">
            <Label>Title</Label>
            <input className="field w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} />
          </label>
          <label className="block space-y-1">
            <Label>Subtitle</Label>
            <input className="field w-full" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          </label>
          <div>
            <Label>Written for</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => (
                <button key={a} type="button" data-on={form.audience === a} className="filter-chip" onClick={() => setForm({ ...form, audience: a })}>
                  {AUDIENCE_NAME[a]}
                </button>
              ))}
            </div>
          </div>
          <label className="block space-y-1">
            <Label>Summary (shown on the public page)</Label>
            <textarea className="field min-h-[96px] w-full" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <Label>What is inside (one point per line)</Label>
            <textarea className="field min-h-[110px] w-full" value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} />
          </label>

          <div>
            <Label>How people get the PDF</Label>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {[
                { v: true, t: "Form first", d: "Visitors leave name and email, then download. Creates a lead." },
                { v: false, t: "Open download", d: "Anyone can download. Counted, but no lead unless they opt in." },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  aria-pressed={form.gated === o.v}
                  onClick={() => setForm({ ...form, gated: o.v })}
                  className={`rounded-[8px] border p-3 text-left transition ${form.gated === o.v ? "border-accent bg-accent-soft" : "border-line hover:border-accent/40"}`}
                >
                  <div className="text-sm font-bold">{o.t}</div>
                  <div className="mt-0.5 text-xs text-muted">{o.d}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <Label>Leads go to</Label>
              <select className="field w-full" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <Label>Permit number (optional)</Label>
              <input className="field w-full" value={form.permitNumber} onChange={(e) => setForm({ ...form, permitNumber: e.target.value })} placeholder="If your market requires one" />
            </label>
          </div>
          <label className="block space-y-1">
            <Label>Next step shown after download</Label>
            <input className="field w-full" value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} placeholder="e.g. Book a free consultation to talk it through." />
          </label>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>

        <div className="space-y-5">
          <div className="surface space-y-3 p-5">
            <h2 className="text-sm font-bold">PDF file</h2>
            {g.hasFile ? (
              <div className="rounded-[8px] bg-[#f4f6f8] p-3 text-sm">
                <div className="truncate font-semibold">{g.fileName}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {formatBytes(g.fileBytes)}
                  {g.pageCount ? ` · ${g.pageCount} pages` : ""} · version {g.version}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No PDF yet. Upload one to be able to publish.</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              data-testid="guide-file-input"
              onChange={(e) => e.target.files?.[0] && upload("file", e.target.files[0])}
            />
            <button type="button" className="btn-ghost inline-flex w-full items-center justify-center gap-1.5" disabled={busy === "file"} onClick={() => fileRef.current?.click()}>
              <FileUp size={15} /> {busy === "file" ? "Uploading…" : g.hasFile ? "Replace PDF" : "Upload PDF"}
            </button>
            <p className="text-xs text-muted">PDF only, up to 20 MB. Stored privately and only served through download links.</p>
          </div>

          <div className="surface space-y-3 p-5">
            <h2 className="text-sm font-bold">Cover image</h2>
            <div className="mx-auto w-[46%]">
              <GuideCover title={g.title} org="" audience={g.audience} coverUrl={g.coverUrl} size="sm" />
            </div>
            <input
              ref={coverRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              data-testid="guide-cover-input"
              onChange={(e) => e.target.files?.[0] && upload("cover", e.target.files[0])}
            />
            <button type="button" className="btn-ghost inline-flex w-full items-center justify-center gap-1.5" disabled={busy === "cover"} onClick={() => coverRef.current?.click()}>
              <ImageUp size={15} /> {busy === "cover" ? "Uploading…" : "Upload cover"}
            </button>
            <p className="text-xs text-muted">Optional. Without one, a designed cover is created from the title.</p>
          </div>
        </div>
      </div>

      <div className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Share</h2>
            <p className="text-xs text-muted">
              {g.status === "PUBLISHED"
                ? "Add where you will post it, so you can see which channel brings the most requests."
                : "Publish the guide to make this link work."}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-5 md:grid-cols-[1fr_190px]">
          <div className="space-y-3">
            <div>
              <Label>Quick channel</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SOURCE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    data-on={utm.source === p.source && utm.medium === p.medium}
                    className="filter-chip"
                    onClick={() =>
                      setUtm((u) =>
                        u.source === p.source && u.medium === p.medium
                          ? { ...u, source: "", medium: "" }
                          : { ...u, source: p.source, medium: p.medium },
                      )
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["source", "medium", "campaign"] as const).map((k) => (
                <label key={k} className="block space-y-1">
                  <Label>{k}</Label>
                  <input
                    className="field w-full"
                    value={utm[k]}
                    onChange={(e) => setUtm({ ...utm, [k]: e.target.value.toLowerCase().replace(/[^a-z0-9_.\- ]/g, "") })}
                    placeholder={k === "campaign" ? "e.g. spring-launch" : ""}
                  />
                </label>
              ))}
            </div>
            <div>
              <Label>Link</Label>
              <div className="mt-1 flex gap-2">
                <input readOnly className="field w-full font-mono text-xs" value={shareUrl} data-testid="share-url" onFocus={(e) => e.target.select()} />
                <button type="button" className="btn-ghost inline-flex shrink-0 items-center gap-1.5" onClick={() => copy(shareUrl, "link")}>
                  {copied === "link" ? <Check size={14} /> : <Copy size={14} />} {copied === "link" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
          <div className="text-center">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code for the guide link" className="mx-auto h-[160px] w-[160px] rounded-[8px] border border-line" />
            )}
            {qr && (
              <a href={qr} download={`${g.slug}-qr.png`} className="mt-2 inline-block text-sm font-semibold text-accent">
                Download QR
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Requests</h2>
            <p className="text-xs text-muted">{rows.length} most recent. Each person is also a lead.</p>
          </div>
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1.5"
            onClick={() => downloadFile(`/api/guides/${id}/requests.csv`, `${g.slug}-requests.csv`)}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No requests yet. Share the link above to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="requests-table">
              <thead>
                <tr className="border-b border-line text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-3">When</th>
                  <th className="pr-3">Name</th>
                  <th className="pr-3">Email</th>
                  <th className="pr-3">Phone</th>
                  <th className="pr-3">Channel</th>
                  <th className="pr-3">Opt-in</th>
                  <th className="pr-3">Downloaded</th>
                  <th>Lead stage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="whitespace-nowrap py-2 pr-3 text-muted">{when(r.createdAt)}</td>
                    <td className="pr-3 font-semibold">{r.name}</td>
                    <td className="pr-3">{r.email}</td>
                    <td className="pr-3 text-muted">{r.phone || "-"}</td>
                    <td className="pr-3 text-muted">{r.channel}</td>
                    <td className="pr-3">{r.consentMarketing ? "Yes" : "No"}</td>
                    <td className="pr-3">{r.downloadCount > 0 ? `Yes (${r.downloadCount})` : "No"}</td>
                    <td>
                      {r.lead ? <span className="status-chip bg-[#eef1f4] text-muted">{r.lead.stage}</span> : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
