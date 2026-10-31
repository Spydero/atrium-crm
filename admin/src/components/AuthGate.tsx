"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export type OpsUser = {
  id: string;
  name?: string | null;
  email: string;
  platformRole?: string | null;
};

const OpsUserContext = createContext<OpsUser | null>(null);
export const useOpsUser = () => useContext(OpsUserContext);

export async function signOutTo(router: { replace: (p: string) => void }) {
  await authClient.signOut();
  router.replace("/login");
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      {children}
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, isPending } = authClient.useSession();
  const user = (data?.user ?? null) as OpsUser | null;

  useEffect(() => {
    if (!isPending && !user) {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [isPending, user, pathname, router]);

  if (isPending || !user) {
    return (
      <Splash>
        <p className="text-sm font-semibold text-muted">Checking session…</p>
      </Splash>
    );
  }

  if (!user.platformRole) {
    return (
      <Splash>
        <div className="max-w-sm">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Atrium Ops
          </p>
          <h1 className="font-display mt-3 text-2xl font-bold tracking-tight">
            Not a platform operator
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {user.email} is signed in but has no platform role. This console is
            limited to Atrium operators.
          </p>
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={() => void signOutTo(router)}
          >
            Sign out
          </button>
        </div>
      </Splash>
    );
  }

  return <OpsUserContext.Provider value={user}>{children}</OpsUserContext.Provider>;
}
