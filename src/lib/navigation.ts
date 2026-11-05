// Sidebar navigation. The main group is the daily work; Settings (master data and admin)
// sits at the bottom. To add a module, add an item here — the sidebar renders it.
// Receiving and recording usage are the two buttons fixed at the top right of every page
// (src/components/top-actions.tsx), so they are not in the sidebar.

export type NavIcon = "home" | "inventory" | "tasks" | "items" | "suppliers" | "users" | "categories";

export type NavItem = { href: string; label: string; icon: NavIcon };
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/inventory", label: "Inventory", icon: "inventory" },
      { href: "/tasks", label: "Tasks", icon: "tasks" },
    ],
  },
];

// Shown at the bottom of the sidebar.
export const SETTINGS: NavGroup = {
  label: "Settings",
  items: [
    { href: "/items", label: "Item master data", icon: "items" },
    { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
    { href: "/users", label: "Users", icon: "users" },
    { href: "/settings/categories", label: "Categories", icon: "categories" },
  ],
};

// Pages reached from Inventory (lots, receiving, usage) keep Inventory highlighted.
const ALIASES: Record<string, string[]> = { "/inventory": ["/lots", "/usage", "/receive", "/issues"] };

export function isActive(pathname: string, href: string) {
  const match = (h: string) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`));
  return match(href) || (ALIASES[href] ?? []).some(match);
}

export { SIDEBAR_COOKIE } from "./cookies";
