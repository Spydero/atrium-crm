"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Download, FileText, ShieldCheck } from "lucide-react";
import { API_BASE } from "@/lib/api";
import {
  AUDIENCE_LABEL,
  GuideCover,
  PublicBar,
  PublicFooter,
  formatBytes,
  formatDay,
  type PublicGuide,
  type PublicOrg,
} from "@/components/GuideBits";

type Data = { organization: PublicOrg; guide: PublicGuide; consentText: string };

export default function PublicGuidePage() {
  const { orgSlug, guideSlug } = useParams<{ orgSlug: string; guideSlug: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", consent: false, website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const utm = useRef({ utmSource: "", utmMedium: "", utmCampaign: "", referrer: "" });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let ref = "";
    try {
      if (document.referrer && new URL(document.referrer).origin !== window.location.origin) ref = document.referrer;
    } catch {
      /* ignore */
    }
    utm.current = {
      utmSource: q.get("utm_source") || "",
      utmMedium: q.get("utm_medium") || "",
      utmCampaign: q.get("utm_campaign") || "",
      referrer: ref,
    };
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/public/guides/${orgSlug}/${guideSlug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("not found");
        return r.json() as Promise<Data>;
      })
      .then((d) => {
        setData(d);
        // one view per visitor session
        const key = `guide-view:${orgSlug}/${guideSlug}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          fetch(`${API_BASE}/api/public/guides/${orgSlug}/${guideSlug}/view`, { method: "POST" }).catch(() => {});
        }
      })
      .catch(() => setMissing(true));
  }, [orgSlug, guideSlug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/guides/${orgSlug}/${guideSlug}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone.trim() || null,
          consentMarketing: form.consent,
          website: form.website,
          ...utm.current,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");
      router.push(`/g/${body.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (missing) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">This guide is not available</h1>
          <p className="mt-2 text-muted">It may have been replaced. Ask the team that sent you the link.</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Loading…</div>;
  }
  const { organization: org, guide: g, consentText } = data;
  const details = [
    g.pageCount ? `${g.pageCount} pages` : null,
    "PDF",
    formatBytes(g.fileBytes) || null,
    g.publishedAt ? `Updated ${formatDay(g.updatedAt)}` : null,
  ].filter(Boolean);

  const formEl = (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink">Your name</span>
        <input
          className="field w-full"
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink">Email address</span>
        <input
          className="field w-full"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 flex items-baseline justify-between text-xs font-bold text-ink">
          Phone number <span className="font-medium text-muted">optional</span>
        </span>
        <input
          className="field w-full"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="Include the country code"
        />
        <span className="mt-1 block text-[11px] text-muted">Only if you would like us to reply by phone or WhatsApp.</span>
      </label>

      {/* Honeypot: hidden from people, bots fill it in */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </label>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] bg-[#f4f6f8] p-3 text-[12.5px] leading-snug text-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          checked={form.consent}
          onChange={(e) => setForm({ ...form, consent: e.target.checked })}
        />
        <span>{consentText}</span>
      </label>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="rounded-[8px] border border-[var(--danger)]/25 bg-[#fdf1ef] px-3 py-2 text-sm font-medium text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>

      <button type="submit" className="btn-primary flex w-full items-center justify-center gap-2 py-3" disabled={submitting}>
        <Download size={16} />
        {submitting ? "Preparing your guide…" : g.gated ? "Get my free guide" : "Send me a personal copy"}
      </button>
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
        <ShieldCheck size={13} className="mt-px shrink-0" />
        <span>
          We use your details to send this guide and to reply to you. Nothing else unless you tick the box above.
          {org.privacyUrl && (
            <>
              {" "}
              <a href={org.privacyUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                Privacy notice
              </a>
            </>
          )}
        </span>
      </p>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <PublicBar org={org} />
      <main className="mx-auto grid max-w-5xl gap-10 px-5 py-10 lg:grid-cols-[1fr_380px]">
        <section className="animate-rise">
          <Link href={`/guides/${org.slug}`} className="text-xs font-bold text-muted hover:text-ink">
            All guides
          </Link>
          <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#a68a4b]">
            {AUDIENCE_LABEL[g.audience]}
          </div>
          <h1
            className="mt-2 text-[2.5rem] font-bold leading-[1.08] tracking-[-0.02em]"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {g.title}
          </h1>
          {g.subtitle && <p className="mt-3 text-lg italic text-muted">{g.subtitle}</p>}
          <div className="my-6 h-[3px] w-12 bg-[#a68a4b]" />
          <p className="max-w-xl leading-relaxed text-ink/85">{g.summary}</p>

          {g.benefits.length > 0 && (
            <div className="mt-7">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">What is inside</h2>
              <ul className="mt-3 space-y-2.5">
                {g.benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[15px]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#14213d] text-[#d9c48f]">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <FileText size={14} /> {details.join(" · ")}
            </span>
            {g.owner?.name && <span>Presented by {g.owner.name}</span>}
          </div>
          {g.permitNumber && (
            <div className="mt-3 text-[11px] font-semibold text-muted">Permit no. {g.permitNumber}</div>
          )}
        </section>

        <aside className="animate-rise space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="mx-auto hidden w-[56%] lg:block">
            <GuideCover title={g.title} org={org.name} audience={g.audience} coverUrl={g.coverUrl} />
          </div>
          <div className="surface p-5">
            {g.gated ? (
              <>
                <h2 className="text-lg font-bold">Get your free copy</h2>
                <p className="mb-4 mt-1 text-sm text-muted">Takes ten seconds. The download starts on the next page.</p>
                {formEl}
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">Free to download</h2>
                <p className="mb-4 mt-1 text-sm text-muted">No sign-up needed.</p>
                <a
                  href={`${API_BASE}/api/public/guides/${org.slug}/${g.slug}/file`}
                  className="btn-primary flex w-full items-center justify-center gap-2 py-3"
                >
                  <Download size={16} /> Download the PDF
                </a>
                <div className="mt-4 border-t border-line pt-4">
                  {!showForm ? (
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="text-sm font-semibold text-accent"
                    >
                      Want a personal copy and updates? Add your details
                    </button>
                  ) : (
                    formEl
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      </main>
      <PublicFooter org={org} />
    </div>
  );
}
