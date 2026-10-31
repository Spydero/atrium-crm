"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { listOrganizations, type PlatformOrg } from "@/lib/api";
import { Empty, ErrorNote, PageHeader, fmtDate } from "@/components/ui";

export default function OrganizationsPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<PlatformOrg[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOrganizations()
      .then(setOrgs)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Organizations"
        subtitle="Every brokerage provisioned on Atrium."
        actions={
          <Link href="/organizations/new" className="btn-primary">
            New organization
          </Link>
        }
      />
      <ErrorNote message={error} />
      <div className="surface overflow-hidden">
        {orgs === null && !error ? (
          <Empty>Loading…</Empty>
        ) : orgs && orgs.length === 0 ? (
          <Empty>No organizations yet.</Empty>
        ) : orgs ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>City</th>
                <th>Currency</th>
                <th>Members</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr
                  key={o.id}
                  data-link="true"
                  className="cursor-pointer"
                  onClick={() => router.push(`/organizations/${o.id}`)}
                >
                  <td>
                    <Link
                      href={`/organizations/${o.id}`}
                      className="font-semibold text-accent hover:underline"
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td className="font-mono text-xs text-muted">{o.slug}</td>
                  <td>{o.defaultCity || "—"}</td>
                  <td>{o.currencyCode || "—"}</td>
                  <td className="tabular-nums">{o.memberCount ?? "—"}</td>
                  <td className="text-muted">{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </>
  );
}
