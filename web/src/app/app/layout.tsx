"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type SessionUser = {
  name: string;
  organizationId?: string | null;
  platformRole?: string | null;
};

type BlockReason = "no-org" | "operator";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [blocked, setBlocked] = useState<BlockReason | null>(null);

  // Re-check on every CRM navigation so an Ops login in another tab cannot leave a stale shell.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await authClient.getSession();
        if (cancelled) return;
        if (!data?.session) {
          router.replace("/login");
          return;
        }
        const user = data.user as SessionUser;
        setName(user.name);

        // Ops (:3001) and CRM (:3000) share one Better Auth cookie on :4000.
        // Signing into Ops as platform@ replaces the brokerage session in this browser.
        if (user.platformRole && !user.organizationId) {
          if (!cancelled) {
            setBlocked("operator");
            setReady(true);
          }
          return;
        }

        try {
          await api("/api/settings");
          if (!cancelled) {
            setBlocked(null);
            setReady(true);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (/no organization/i.test(msg)) {
            if (!cancelled) {
              setBlocked(user.platformRole ? "operator" : "no-org");
              setReady(true);
            }
            return;
          }
          if (/session expired|unauthorized/i.test(msg)) return;
          if (!cancelled) setReady(true);
        }
      } catch {
        if (!cancelled) router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading workspace…
      </div>
    );
  }

  if (blocked) {
    const isOps = blocked === "operator";
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <div className="surface max-w-md p-7">
          <div className="font-display text-xl font-bold tracking-[-0.03em]">Atrium</div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-[-0.03em]">
            {isOps ? "Signed in as an operator" : "No brokerage yet"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {isOps ? (
              <>
                Ops and CRM share one browser session on localhost. You&apos;re signed in as{" "}
                {name || "a platform operator"}, which has no brokerage. Sign out, then sign in with
                a brokerage account — or use a separate browser profile for Ops.
              </>
            ) : (
              <>
                You&apos;re signed in as {name || "this account"}, but no organization is linked.
                Accept an invite link, or ask an Atrium operator to provision your firm.
              </>
            )}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                await authClient.signOut();
                router.replace("/login");
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

  return <AppShell userName={name}>{children}</AppShell>;
}
