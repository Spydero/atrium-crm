"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, MailPlus } from "lucide-react";
import { AuthGate, signOutTo, useOpsUser } from "@/components/AuthGate";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/invites", label: "Invites", icon: MailPlus },
];

function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useOpsUser();

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-[var(--sidebar)] px-3 py-5 text-white">
      <Link href="/" className="px-3 pb-6">
        <span className="font-display block text-lg font-bold tracking-tight">
          Atrium Ops
        </span>
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">
          Platform console
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className="nav-link" data-active={active}>
              <Icon size={16} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--sidebar-line)] pt-3">
        <p className="truncate px-3 pb-2 text-xs text-[var(--sidebar-muted)]">
          {user?.email}
          {user?.platformRole ? ` · ${user.platformRole}` : ""}
        </p>
        <button type="button" className="nav-link" onClick={() => void signOutTo(router)}>
          <LogOut size={16} strokeWidth={2} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function OpsShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 px-10 py-8">
          <div className="mx-auto max-w-5xl animate-rise">{children}</div>
        </main>
      </div>
    </AuthGate>
  );
}
