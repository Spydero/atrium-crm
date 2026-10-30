"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarDays,
  PieChart,
  Link2,
  LogOut,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

const nav = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/leads", label: "Leads", icon: Users },
  { href: "/app/listings", label: "Listings", icon: Building2 },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/money", label: "Money Map", icon: PieChart },
  { href: "/app/shortlists", label: "Shortlists", icon: Link2 },
];

export function AppShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-line bg-[var(--sidebar)] px-4 py-5">
        <div className="font-display mb-8 px-2 text-xl font-extrabold tracking-tight">
          ATRIUM
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/app"
                ? pathname === "/app"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-cove text-white"
                    : "text-muted hover:bg-black/[0.04] hover:text-ink"
                }`}
              >
                <Icon size={17} strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <div className="mb-2 px-2 text-sm font-semibold">{userName || "Agent"}</div>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-black/[0.04] hover:text-ink"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
