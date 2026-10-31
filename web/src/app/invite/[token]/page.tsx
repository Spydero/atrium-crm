"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";

type InvitePreview = {
  email: string;
  name: string;
  role: string;
  expiresAt: string;
  organization: { id: string; name: string; slug: string };
};

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/invites/${token}`, { credentials: "include" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Invite unavailable");
        setInvite(body.invitation);
        setName(body.invitation.name || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load invite"));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/invites/${token}/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, name: name.trim() || undefined }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Could not accept invite");
      setDone(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="animate-rise w-full max-w-[420px] surface p-7">
        <div className="font-display text-xl font-bold tracking-[-0.03em]">Atrium</div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-[-0.03em]">Accept invite</h1>
        {error && !invite && (
          <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>
        )}
        {invite && !done && (
          <>
            <p className="mt-2 text-sm text-muted">
              Join <span className="font-semibold text-ink">{invite.organization.name}</span> as{" "}
              <span className="font-semibold text-ink">{invite.role}</span>.
            </p>
            <p className="mt-1 text-sm text-muted">{invite.email}</p>
            <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Your name
              </label>
              <input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} required />
              <label className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Create password
              </label>
              <input
                className="field w-full"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary mt-2 w-full">
                {loading ? "Creating account…" : "Activate account"}
              </button>
            </form>
          </>
        )}
        {done && (
          <p className="mt-4 text-sm font-medium text-accent">Account ready. Redirecting to sign in…</p>
        )}
        <p className="mt-6 text-sm text-muted">
          Already activated?{" "}
          <Link href="/login" className="font-semibold text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
