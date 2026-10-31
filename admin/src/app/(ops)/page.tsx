"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getOverview, type PlatformOverview } from "@/lib/api";
import { ErrorNote, PageHeader } from "@/components/ui";

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number | undefined;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 px-6 py-5 first:pl-0 hover:bg-[#f6f9fa]"
    >
      <span className="label !mb-0">{label}</span>
      <span className="font-display text-5xl font-bold tracking-tight tabular-nums">
        {value ?? "—"}
      </span>
      <span className="flex items-center gap-1 text-xs font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
        View <ArrowRight size={12} />
      </span>
    </Link>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOverview()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Platform-wide state at a glance."
        actions={
          <Link href="/organizations/new" className="btn-primary">
            New organization
          </Link>
        }
      />
      <ErrorNote message={error} />
      <div className="surface grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
        <Stat label="Organizations" value={data?.organizations} href="/organizations" />
        <Stat label="Pending invites" value={data?.pendingInvites} href="/invites" />
        {data?.members !== undefined && (
          <Stat label="Members" value={data.members} href="/organizations" />
        )}
      </div>
    </>
  );
}
