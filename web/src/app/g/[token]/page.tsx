"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";
import { API_BASE } from "@/lib/api";
import {
  GuideCover,
  PublicBar,
  PublicFooter,
  formatBytes,
  type PublicGuide,
  type PublicOrg,
} from "@/components/GuideBits";

type Data = { firstName: string; organization: PublicOrg; guide: PublicGuide };

/** Personal link. Works any time, so people can come back to re-download. */
export default function GuideThanksPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/public/guide-requests/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("not found");
        return r.json() as Promise<Data>;
      })
      .then(setData)
      .catch(() => setMissing(true));
  }, [token]);

  if (missing) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">This link is no longer available</h1>
          <p className="mt-2 text-muted">The guide may have been replaced. Ask the team that sent it for the latest copy.</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Loading…</div>;
  }
  const { organization: org, guide: g, firstName } = data;

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <PublicBar org={org} />
      <main className="mx-auto grid max-w-4xl items-center gap-10 px-5 py-14 md:grid-cols-[240px_1fr]">
        <div className="mx-auto w-[220px] md:w-full">
          <GuideCover title={g.title} org={org.name} audience={g.audience} coverUrl={g.coverUrl} />
        </div>
        <section className="animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#e6f4ea] px-3 py-1 text-xs font-bold text-[#176338]">
            <CheckCircle2 size={14} /> Your guide is ready
          </div>
          <h1
            className="mt-4 text-4xl font-bold leading-tight tracking-[-0.02em]"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            Thank you, {firstName}
          </h1>
          <p className="mt-3 text-lg text-muted">
            <strong className="text-ink">{g.title}</strong> is ready to download.
          </p>
          <a
            href={`${API_BASE}/api/public/guide-files/${token}`}
            className="btn-primary mt-6 inline-flex items-center gap-2 px-6 py-3.5 text-base"
          >
            <Download size={18} /> Download the PDF
            {g.fileBytes ? <span className="font-medium opacity-80">({formatBytes(g.fileBytes)})</span> : null}
          </a>
          <p className="mt-3 text-sm text-muted">
            Bookmark this page. The link stays active, so you can download the guide again whenever you need it.
          </p>

          {g.ctaText && (
            <div className="mt-8 rounded-[10px] border border-[#a68a4b]/40 bg-[#fbf8f0] p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a68a4b]">Next step</div>
              <p className="mt-1 font-semibold text-ink">{g.ctaText}</p>
              {g.owner?.name && <p className="mt-1 text-sm text-muted">{g.owner.name} will be in touch.</p>}
            </div>
          )}

          <Link href={`/guides/${org.slug}`} className="mt-8 inline-block text-sm font-bold text-accent">
            See more guides from {org.name}
          </Link>
        </section>
      </main>
      <PublicFooter org={org} />
    </div>
  );
}
