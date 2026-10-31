"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { inviteUrl, listInvites, type PlatformInvite } from "@/lib/api";
import {
  CopyButton,
  Empty,
  ErrorNote,
  PageHeader,
  RoleChip,
  fmtDate,
} from "@/components/ui";

export default function InvitesPage() {
  const [invites, setInvites] = useState<PlatformInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInvites()
      .then(setInvites)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Invites"
        subtitle="Outstanding invitations across all organizations."
      />
      <ErrorNote message={error} />
      <div className="surface overflow-hidden">
        {invites === null && !error ? (
          <Empty>Loading…</Empty>
        ) : invites && invites.length === 0 ? (
          <Empty>No pending invites.</Empty>
        ) : invites ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invitee</th>
                <th>Organization</th>
                <th>Role</th>
                <th>Sent</th>
                <th>Expires</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => {
                const url = inviteUrl(i);
                return (
                  <tr key={i.id}>
                    <td>
                      <div className="font-semibold">{i.name || i.email}</div>
                      {i.name && <div className="text-xs text-muted">{i.email}</div>}
                    </td>
                    <td>
                      {i.organizationId ? (
                        <Link
                          href={`/organizations/${i.organizationId}`}
                          className="font-semibold text-accent hover:underline"
                        >
                          {i.organizationName || i.organizationSlug || "Organization"}
                        </Link>
                      ) : (
                        i.organizationName || "—"
                      )}
                    </td>
                    <td>
                      <RoleChip role={i.role} />
                    </td>
                    <td className="text-muted">{fmtDate(i.createdAt)}</td>
                    <td className="text-muted">{fmtDate(i.expiresAt)}</td>
                    <td className="text-right">
                      {url && <CopyButton value={url} label="Copy link" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </>
  );
}
