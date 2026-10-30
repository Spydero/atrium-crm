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
  BarChart3,
  Settings,
  MapPinned,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

const groups = [
  {
    label: "Work",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard },
      { href: "/app/leads", label: "Leads", icon: Users },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/app/listings", label: "Listings", icon: Building2 },
      { href: "/app/map", label: "Map", icon: MapPinned },
      { href: "/app/shortlists", label: "Shortlists", icon: Link2 },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/app/money", label: "Money Map", icon: PieChart },
      { href: "/app/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Admin",
    items: [{ href: "/app/settings", label: "Settings", icon: Settings }],
  },
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
      <aside className="sticky top-0 flex h-screen w-[212px] shrink-0 flex-col bg-[var(--sidebar)] px-3 py-5 text-white">
        <div className="font-display mb-6 px-3 text-[1.35rem] font-bold tracking-[-0.04em]">
          Atrium
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">
            Brokerage
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--sidebar-muted)]">
                {group.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active =
                    href === "/app"
                      ? pathname === "/app"
                      : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2.5 text-[13px] font-semibold transition ${
                        active
                          ? "bg-[var(--accent)] text-white"
                          : "text-[var(--sidebar-muted)] hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <Icon size={16} strokeWidth={1.8} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-[var(--sidebar-line)] px-2 pt-4">
          <div className="mb-2 truncate px-1 text-[13px] font-semibold text-white/90">
            {userName || "Agent"}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-2 text-[13px] text-[var(--sidebar-muted)] hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-5 lg:p-7">{children}</main>
    </div>
  );
}
