import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { UserPicker } from "@/components/user-picker";

export const metadata: Metadata = {
  title: "SVLSG Inventory",
  description: "Receiving, quarantine, inspection and inventory for SVLSG",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/items", label: "Items" },
  { href: "/suppliers", label: "Suppliers" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [users, currentUser] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getCurrentUser(),
  ]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight text-slate-900">
              SVLSG Inventory
            </Link>
            <nav className="flex gap-4 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-slate-600 hover:text-slate-900">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto">
              <UserPicker
                users={users.map((u) => ({ id: u.id, label: `${u.name} (${u.initials}) · ${u.role}` }))}
                currentUserId={currentUser?.id ?? null}
              />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
