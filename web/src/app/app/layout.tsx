"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { AppShell } from "@/components/AppShell";
import { WorkspaceContext } from "@/lib/workspace";
import { api, ApiError, type OrgSettings } from "@/lib/api";

type SessionUser = {
  name: string;
  organizationId?: string | null;
  platformRole?: string | null;
};

type BlockReason = "no-org" | "operator" | "suspended" | "unavailable";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [blocked, setBlocked] = useState<BlockReason | null>(null);

  // Re-check on every CRM navigation so an Ops login in another tab cannot leave a stale shell.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const { data, error } = await authClient.getSession();
        if (controller.signal.aborted) return;
        if (error) throw error;
        if (!data?.session) {
          const next = window.location.pathname + window.location.search;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        const user = data.user as SessionUser;
        setName(user.name);

        // Ops (:3001) and CRM (:3000) share one Better Auth cookie on :4000.
        // Signing into Ops as platform@ replaces the brokerage session in this browser.
        if (user.platformRole && !user.organizationId) {
          setBlocked("operator");
          return;
        }

        try {
          const workspace = await api<OrgSettings>("/api/settings", { signal: controller.signal });
          if (controller.signal.aborted) return;
          setSettings(workspace);
          setBlocked(null);
        } catch (e) {
          if (controller.signal.aborted || (e instanceof ApiError && e.status === 401)) return;
          const message = e instanceof Error ? e.message : "";
          if (/no organization/i.test(message)) setBlocked(user.platformRole ? "operator" : "no-org");
          else if (/brokerage is suspended/i.test(message)) setBlocked("suspended");
          else setBlocked("unavailable");
        }
      } catch {
        if (!controller.signal.aborted) setBlocked("unavailable");
      }
    })();
    return () => controller.abort();
  }, [router, pathname, attempt]);

  if (blocked) {
    const titles: Record<BlockReason, string> = {
      operator: "Signed in as an operator",
      "no-org": "No brokerage yet",
      suspended: "Brokerage suspended",
      unavailable: "Workspace unavailable",
    };
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <div className="surface max-w-md p-7">
          <div className="font-display text-xl font-bold tracking-[-0.03em]">Atrium</div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-[-0.03em]">
            {titles[blocked]}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {blocked === "operator" ? (
              <>
                Ops and CRM share one browser session on localhost. You&apos;re signed in as{" "}
                {name || "a platform operator"}, which has no brokerage. Sign out, then sign in with
                a brokerage account — or use a separate browser profile for Ops.
              </>
            ) : blocked === "suspended" ? (
              "Contact your brokerage administrator about restoring access."
            ) : blocked === "unavailable" ? (
              "Atrium couldn’t verify access to your workspace. Try again."
            ) : (
              <>
                You&apos;re signed in as {name || "this account"}, but no organization is linked.
                Accept an invite link, or ask an Atrium operator to provision your firm.
              </>
            )}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {blocked === "unavailable" && (
              <button type="button" className="btn-primary" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            )}
            <button
              type="button"
              className={blocked === "unavailable" ? "btn-ghost" : "btn-primary"}
              onClick={async () => {
                await authClient.signOut();
                const next = window.location.pathname + window.location.search;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
              }}
            >
              Sign out
            </button>
            <Link href="/login" className="btn-ghost">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return <p className="flex min-h-screen items-center justify-center text-muted">Loading workspace…</p>;
  }

  return (
    <WorkspaceContext.Provider value={settings}>
      <AppShell userName={name}>{children}</AppShell>
    </WorkspaceContext.Provider>
  );
}
