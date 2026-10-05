// Sidebar navigation, grouped by module. To add a module (e.g. Raw materials,
// Production, Export), add a group or an item here — the sidebar renders it.

export type NavIcon = "home" | "receive" | "lots" | "items" | "suppliers" | "users";

export type NavItem = { href: string; label: string; icon: NavIcon };
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: null, items: [{ href: "/", label: "Home", icon: "home" }] },
  {
    label: "Inventory",
    items: [
      { href: "/receive", label: "Receive", icon: "receive" },
      { href: "/lots", label: "Lots", icon: "lots" },
    ],
  },
  {
    label: "Master data",
    items: [
      { href: "/items", label: "Items", icon: "items" },
      { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
    ],
  },
  { label: "Admin", items: [{ href: "/users", label: "Users", icon: "users" }] },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export { SIDEBAR_COOKIE } from "./cookies";
