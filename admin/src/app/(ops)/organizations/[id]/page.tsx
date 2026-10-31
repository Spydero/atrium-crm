"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  INVITE_ROLES,
  createInvite,
  getOrganization,
  inviteUrl,
  type MemberRole,
  type PlatformInvite,
  type PlatformOrgDetail,
} from "@/lib/api";
import {
  CopyButton,
  Empty,
  ErrorNote,
  PageHeader,
  RoleChip,
  fmtDate,
} from "@/components/ui";

function InviteLink({ invite }: { invite: PlatformInvite }) {
  const url = inviteUrl(invite);
  if (!url) return <span className="text-xs text-muted">Link unavailable</span>;
  return (
    <div className="flex items-center gap-2">
      <code className="max-w-[18rem] truncate rounded bg-[#f1f4f5] px-2 py-1 font-mono text-xs">
        {url}
      </code>
      <CopyButton value={url} />
    </div>
  );
}

export default function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [org, setOrg] = useState<PlatformOrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<PlatformInvite | null>(null);

  const load = useCallback(() => {
    getOrganization(id)
      .then(setOrg)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  async function onInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setFormError(null);
    try {
      const inv = await createInvite(id, {
        email: String(f.get("email")).trim(),
        name: String(f.get("name") ?? "").trim() || undefined,
        role: f.get("role") as MemberRole,
      });
      setCreated(inv);
      form.reset();
      load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pending = (org?.invites ?? []).filter(
    (i) => !i.status || i.status.toLowerCase() === "pending",
  );

  return (
    <>
      <Link
        href="/organizations"
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft size={13} /> Organizations
      </Link>
      <PageHeader
        title={org?.name ?? "Organization"}
        subtitle={
          org
            ? [org.slug, org.defaultCity, org.currencyCode].filter(Boolean).join(" · ")
            : undefined
        }
      />
      <ErrorNote message={error} />

      {org && (
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-8">
            <section>
              <h2 className="font-display mb-3 text-sm font-bold">
                Members <span className="text-muted">({org.members.length})</span>
              </h2>
              <div className="surface overflow-hidden">
                {org.members.length === 0 ? (
                  <Empty>No members yet. Invite an owner to get started.</Empty>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {org.members.map((m) => (
                        <tr key={m.id}>
                          <td className="font-semibold">{m.name || "—"}</td>
                          <td className="text-muted">{m.email}</td>
                          <td>
                            <RoleChip role={m.role} />
                          </td>
                          <td className="text-muted">{fmtDate(m.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section>
              <h2 className="font-display mb-3 text-sm font-bold">
                Pending invites <span className="text-muted">({pending.length})</span>
              </h2>
              <div className="surface overflow-hidden">
                {pending.length === 0 ? (
                  <Empty>No pending invites.</Empty>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invitee</th>
                        <th>Role</th>
                        <th>Accept link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <div className="font-semibold">{i.name || i.email}</div>
                            {i.name && <div className="text-xs text-muted">{i.email}</div>}
                          </td>
                          <td>
                            <RoleChip role={i.role} />
                          </td>
                          <td>
                            <InviteLink invite={i} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>

          <aside>
            <h2 className="font-display mb-3 text-sm font-bold">Invite owner or admin</h2>
            <p className="mb-3 text-xs text-muted">
              Brokers join from the CRM after the owner invites them. This console is platform-only.
            </p>
            <form onSubmit={onInvite} className="surface space-y-4 p-5">
              <ErrorNote message={formError} />
              <div>
                <label className="label">Email</label>
                <input name="email" type="email" required className="field" />
              </div>
              <div>
                <label className="label">Name</label>
                <input name="name" className="field" />
              </div>
              <div>
                <label className="label">Role</label>
                <select name="role" className="field" defaultValue="owner">
                  {INVITE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? "Sending…" : "Create invite"}
              </button>
            </form>

            {created && (
              <div className="mt-5 border-l-2 border-accent pl-4" role="status">
                <p className="text-sm font-bold">Invite created for {created.email}</p>
                <p className="mb-2 text-xs text-muted">
                  Share this link with them. It&apos;s how they join.
                </p>
                {inviteUrl(created) ? (
                  <>
                    <code className="mb-2 block break-all rounded bg-[#f1f4f5] p-2 font-mono text-xs">
                      {inviteUrl(created)}
                    </code>
                    <CopyButton value={inviteUrl(created)!} label="Copy link" />
                  </>
                ) : (
                  <p className="text-xs text-muted">
                    The API didn&apos;t return a token for this invite.
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
