"use client";

import { FileText } from "lucide-react";

export const AUDIENCE_LABEL: Record<string, string> = {
  BUYER: "For buyers",
  SELLER: "For sellers",
  INVESTOR: "For investors",
  RENTER: "For renters",
  GENERAL: "General guide",
};

export type PublicOrg = {
  name: string;
  slug: string;
  privacyUrl?: string | null;
  licenseLabel?: string;
  licenseNumber?: string | null;
};

export type PublicGuide = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  audience: string;
  summary: string;
  benefits: string[];
  coverUrl: string | null;
  pageCount: number | null;
  gated: boolean;
  permitNumber: string | null;
  ctaText: string;
  version: number;
  publishedAt: string | null;
  updatedAt: string;
  fileBytes: number | null;
  owner?: { name: string } | null;
};

export function formatBytes(n: number | null | undefined) {
  if (!n) return "";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function formatDay(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Cover art. Uses the uploaded image if there is one, otherwise a designed typographic cover. */
export function GuideCover({
  title,
  org,
  audience,
  coverUrl,
  size = "lg",
}: {
  title: string;
  org: string;
  audience: string;
  coverUrl?: string | null;
  size?: "xs" | "sm" | "lg";
}) {
  const lg = size === "lg";
  const xs = size === "xs";
  return (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden rounded-[6px] shadow-[0_18px_40px_rgba(18,30,60,0.22)]"
      style={{ background: "#14213d" }}
    >
      {xs && !coverUrl ? (
        <div className="flex h-full flex-col justify-between p-2">
          <div className="h-[2px] w-4 bg-[#a68a4b]" />
          <div
            className="line-clamp-5 text-[0.5rem] font-bold leading-[1.15] text-white"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {title}
          </div>
        </div>
      ) : coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt={`Cover of ${title}`} className="h-full w-full object-cover" />
      ) : (
        <div className={`flex h-full flex-col justify-between ${lg ? "p-7" : "p-4"}`}>
          <div>
            <div
              className={`font-bold uppercase text-[#d9c48f] ${lg ? "text-[11px] tracking-[0.24em]" : "text-[8px] tracking-[0.2em]"}`}
            >
              {org}
            </div>
            <div className={`mt-3 h-[3px] bg-[#a68a4b] ${lg ? "w-12" : "w-8"}`} />
          </div>
          <div>
            <div
              className={`mb-2 font-bold uppercase text-[#d9c48f] ${lg ? "text-[10px] tracking-[0.2em]" : "text-[7px] tracking-[0.16em]"}`}
            >
              {AUDIENCE_LABEL[audience] || "Guide"}
            </div>
            <div
              className={`font-bold leading-[1.1] text-white ${lg ? "text-[1.9rem]" : "text-[1.05rem]"}`}
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {title}
            </div>
          </div>
          <FileText className="text-[#a68a4b]/70" size={lg ? 28 : 16} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-[7px] rounded-[3px] border border-[#a68a4b]/40" />
    </div>
  );
}

/** Top bar used on every public guide page. */
export function PublicBar({ org }: { org: PublicOrg }) {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <a
          href={`/guides/${org.slug}`}
          className="text-[13px] font-bold uppercase tracking-[0.2em] text-ink"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          {org.name}
        </a>
        {org.licenseNumber && (
          <span className="text-[11px] font-semibold text-muted">
            {org.licenseLabel || "Licence no."} {org.licenseNumber}
          </span>
        )}
      </div>
    </header>
  );
}

export function PublicFooter({ org }: { org: PublicOrg }) {
  return (
    <footer className="mx-auto max-w-5xl px-5 pb-10 pt-8 text-xs text-muted">
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <span>
          {org.name}
          {org.licenseNumber ? ` · ${org.licenseLabel || "Licence no."} ${org.licenseNumber}` : ""}
        </span>
        {org.privacyUrl ? (
          <a href={org.privacyUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Privacy notice
          </a>
        ) : (
          <span>We only use your details to send you this guide and to reply to you.</span>
        )}
      </div>
    </footer>
  );
}
