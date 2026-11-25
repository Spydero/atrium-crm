"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
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
  BookOpen,
  MessageSquare,
  Menu,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

const groups = [
  {
    label: "Work",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard },
      { href: "/app/leads", label: "Leads", icon: Users },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/app/messages", label: "Messages", icon: MessageSquare },
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
    label: "Marketing",
    items: [{ href: "/app/guides", label: "Guides", icon: BookOpen }],
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void api<{ unread: number }>("/api/messages/unread").then(data => {
        if (active) setUnread(data.unread);
      }).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pathname]);

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }} className="flex shrink-0 flex-col bg-[var(--sidebar)] px-3 py-3 text-white md:sticky md:top-0 md:h-dvh md:w-[212px] md:py-5">
        <div className="flex items-center justify-between md:mb-6">
        <div className="font-display px-3 text-[1.35rem] font-bold tracking-[-0.04em]">
          Atrium
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">
            Brokerage
          </span>
        </div>
          <button ref={menuButton} type="button" aria-expanded={menuOpen} aria-controls="workspace-menu"
            onClick={() => setMenuOpen(open => !open)}
            className="flex min-h-11 items-center gap-2 rounded px-3 text-sm font-semibold md:hidden">
            {menuOpen ? <X size={18} /> : <Menu size={18} />} Menu
          </button>
        </div>
        <div id="workspace-menu" className={`${menuOpen ? "flex" : "hidden"} mt-3 min-h-0 flex-1 flex-col md:mt-0 md:flex`}>
        <nav aria-label="Workspace" className="flex flex-1 flex-col gap-3 md:gap-4 md:overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label} className="shrink-0">
              <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--sidebar-muted)]">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-0.5 md:flex md:flex-col">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active =
                    href === "/app"
                      ? pathname === "/app"
                      : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2.5 text-[13px] whitespace-nowrap font-semibold transition ${
                        active
                          ? "bg-[var(--accent)] text-white"
                          : "text-[var(--sidebar-muted)] hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <Icon size={16} strokeWidth={1.8} />
                      {label}
                      {href === "/app/messages" && unread > 0 && (
                        <span className="ml-auto rounded-full bg-white/20 px-2 text-xs" aria-label={`${unread} unread messages`}>
                          {unread}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-2 flex items-center justify-between border-t md:mt-auto md:block border-[var(--sidebar-line)] px-2 pt-4">
          <div className="truncate md:mb-2 px-1 text-[13px] font-semibold text-white/90">
            {userName || "Agent"}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex shrink-0 items-center md:w-full gap-2 rounded-[var(--radius)] px-2 py-2 text-[13px] text-[var(--sidebar-muted)] hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-5 lg:p-7">{children}</main>
    </div>
  );
}
