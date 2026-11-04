"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { setCurrentUser } from "@/app/actions";
import { NAV, SETTINGS, SIDEBAR_COOKIE, isActive, type NavGroup, type NavIcon } from "@/lib/navigation";

type SidebarUser = { id: number; name: string; initials: string; role: string; qcAuthorized: boolean };

// Collapsible left sidebar (desktop) / slide-in drawer (phone).
// Collapsed state is kept in a cookie so the server renders it the same way.
export function Sidebar({
  users,
  currentUser,
  initiallyCollapsed,
  phoneActions,
}: {
  users: SidebarUser[];
  currentUser: SidebarUser | null;
  initiallyCollapsed: boolean;
  phoneActions?: React.ReactNode; // the top-right buttons, shown in the phone top bar
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }

  // On phones the drawer always shows labels.
  const narrow = collapsed && !mobileOpen;
  const close = () => setMobileOpen(false);

  // One nav group (a render helper, not a component: it reads this render's state).
  const renderGroup = (group: NavGroup, className: string, key?: string | number) => (
    <div key={key} className={className}>
      {group.label &&
        (narrow ? (
          <div className="mx-3 mb-2 border-t border-slate-200" aria-hidden />
        ) : (
          <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
        ))}
      <ul className="space-y-0.5">
        {group.items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={close}
                title={narrow ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md py-2 text-sm font-medium ${narrow ? "justify-center px-2" : "px-3"} ${
                  active ? "bg-sky-50 text-sky-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon name={item.icon} className={active ? "text-sky-700" : "text-slate-400"} />
                {!narrow && item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const panel = (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 shrink-0 items-center border-b border-slate-200 ${narrow ? "justify-center px-2" : "justify-between px-4"}`}>
        <Link href="/" onClick={close} className="flex items-center" aria-label="SVLSG Inventory — Home">
          <Image
            src="/logo.svg"
            alt="SVLSG"
            width={narrow ? 36 : 128}
            height={36}
            unoptimized
            priority
            className={narrow ? "h-9 w-9 object-cover object-left" : "h-9 w-auto"}
          />
        </Link>
        {mobileOpen && (
          <button type="button" onClick={close} className="rounded p-1 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Close menu">
            <Icon name="close" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
        {NAV.map((group, gi) => renderGroup(group, gi ? "mt-4" : "", group.label ?? gi))}
        {/* Settings: master data and admin, at the bottom */}
        {renderGroup(SETTINGS, "mt-auto pt-4")}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-slate-200 p-2">
        {currentUser && (
          <div className={`flex items-center gap-2 rounded-md px-2 py-2 ${narrow ? "justify-center" : ""}`} title={narrow ? currentUser.name : undefined}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {currentUser.initials}
            </span>
            {!narrow && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{currentUser.name}</span>
                <span className={`block text-xs ${currentUser.qcAuthorized ? "text-emerald-700" : "text-slate-500"}`}>
                  {currentUser.qcAuthorized ? "QC authorized" : "Not QC authorized"}
                  {currentUser.role === "admin" && " · Admin"}
                </span>
              </span>
            )}
          </div>
        )}
        {!narrow && (
          <label className="block px-2 pb-1">
            <span className="mb-1 block text-xs text-slate-500">Switch user</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
              value={currentUser?.id ?? ""}
              disabled={pending}
              onChange={(e) => startTransition(() => setCurrentUser(Number(e.target.value)))}
            >
              {!currentUser && (
                <option value="" disabled>
                  Pick a user…
                </option>
              )}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.initials})
                </option>
              ))}
            </select>
          </label>
        )}
        <Link
          href="/?tour=1"
          onClick={close}
          title={narrow ? "Show tour again" : undefined}
          className={`flex items-center gap-3 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-100 ${narrow ? "justify-center px-2" : "px-3"}`}
        >
          <Icon name="tour" className="text-slate-400" />
          {!narrow && "Show tour again"}
        </Link>
        <button
          type="button"
          onClick={toggle}
          className={`hidden w-full items-center gap-3 rounded-md py-2 text-sm text-slate-600 hover:bg-slate-100 md:flex ${narrow ? "justify-center px-2" : "px-3"}`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : undefined}
        >
          <Icon name={collapsed ? "expand" : "collapse"} className="text-slate-400" />
          {!narrow && "Collapse"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Phone: top bar with a menu button and the two top-right actions */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded p-1 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <Image src="/logo.svg" alt="SVLSG" width={110} height={30} unoptimized className="hidden h-7 w-auto min-[420px]:block" />
        <div className="ml-auto">{phoneActions}</div>
      </div>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-900/40 md:hidden" onClick={close} aria-hidden />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white transition-transform md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 md:transition-[width] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-16" : "md:w-52"}`}
      >
        {panel}
      </aside>
    </>
  );
}

const PATHS: Record<NavIcon | "tour" | "collapse" | "expand" | "menu" | "close", string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z",
  inventory: "M4 7l8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  categories: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  items: "M20 7 12 3 4 7v10l8 4 8-4V7ZM4 7l8 4 8-4M12 11v10",
  suppliers: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
  users: "M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  tour: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v.01M12 13a2 2 0 1 0-2-2",
  collapse: "M15 6l-6 6 6 6",
  expand: "M9 6l6 6-6 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
};

function Icon({ name, className = "" }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 shrink-0 ${className}`} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
