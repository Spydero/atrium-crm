"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { API_BASE } from "@/lib/api";
import {
  AUDIENCE_LABEL,
  GuideCover,
  PublicBar,
  PublicFooter,
  type PublicGuide,
  type PublicOrg,
} from "@/components/GuideBits";

export default function GuideLibraryPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [data, setData] = useState<{ organization: PublicOrg; guides: PublicGuide[] } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/public/guides/${orgSlug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setMissing(true));
  }, [orgSlug]);

  if (missing) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">We could not find that page</h1>
          <p className="mt-2 text-muted">Check the link, or ask the team that sent it to you.</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Loading…</div>;
  }
  const { organization: org, guides } = data;

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <PublicBar org={org} />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="animate-rise">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#a68a4b]">Free guides</div>
          <h1
            className="mt-2 max-w-2xl text-4xl font-bold leading-[1.1] tracking-[-0.02em]"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            Practical guides from {org.name}
          </h1>
          <p className="mt-3 max-w-2xl text-muted">
            Short, plain-language guides for buying, selling, renting and investing. Pick the one that fits
            where you are today.
          </p>
        </div>

        {guides.length === 0 ? (
          <div className="surface mt-10 p-8 text-center text-muted">No guides are published yet. Please check back soon.</div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((g) => (
              <Link
                key={g.id}
                href={`/guides/${org.slug}/${g.slug}`}
                className="surface group flex flex-col p-5 transition hover:border-[#a68a4b]"
              >
                <div className="mx-auto w-[58%]">
                  <GuideCover title={g.title} org={org.name} audience={g.audience} coverUrl={g.coverUrl} size="sm" />
                </div>
                <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#a68a4b]">
                  {AUDIENCE_LABEL[g.audience]}
                </div>
                <h2 className="mt-1 text-lg font-bold leading-snug">{g.title}</h2>
                <p className="mt-1 line-clamp-3 text-sm text-muted">{g.summary}</p>
                <div className="mt-auto flex items-center justify-between pt-4 text-sm font-bold text-accent">
                  <span>{g.gated ? "Get the guide" : "Read and download"}</span>
                  <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <PublicFooter org={org} />
    </div>
  );
}
