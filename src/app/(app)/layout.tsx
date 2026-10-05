import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { SIDEBAR_COOKIE } from "@/lib/navigation";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [users, currentUser, cookieStore] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getCurrentUser(),
    cookies(),
  ]);
  const pick = (u: { id: number; name: string; initials: string; role: string; qcAuthorized: boolean }) => ({
    id: u.id,
    name: u.name,
    initials: u.initials,
    role: u.role,
    qcAuthorized: u.qcAuthorized,
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        users={users.map(pick)}
        currentUser={currentUser && pick(currentUser)}
        initiallyCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed"}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">{children}</div>
      </main>
    </div>
  );
}
