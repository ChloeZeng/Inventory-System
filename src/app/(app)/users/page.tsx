import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { Badge, PageHeader, Table } from "@/components/ui";
import { AuditHistory } from "@/components/audit-history";
import { QcAuthorizationForm } from "./qc-authorization-form";
import { setQcAuthorization } from "./actions";

export default async function UsersPage() {
  const [me, users] = await Promise.all([getCurrentUser(), prisma.user.findMany({ orderBy: { name: "asc" } })]);
  const isAdmin = me?.role === "admin";

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Everyone can use every screen. QC authorized users can also set inspection dispositions, release or reject lots, resolve QC follow-ups and change ASL approval."
      />
      <Table
        head={["Name", "Initials", "Access", "QC authorized", isAdmin ? "Change (admin)" : ""].filter(Boolean)}
      >
        {users.map((u) => (
          <tr key={u.id} className="align-top">
            <td className="px-4 py-3 font-medium">
              {u.name} {!u.active && <Badge>inactive</Badge>}
            </td>
            <td className="px-4 py-3 font-mono">{u.initials}</td>
            <td className="px-4 py-3">{u.role === "admin" ? <Badge tone="blue">Admin</Badge> : "User"}</td>
            <td className="px-4 py-3">{u.qcAuthorized ? <Badge tone="green">QC authorized</Badge> : <Badge>No</Badge>}</td>
            {isAdmin && (
              <td className="px-4 py-3">
                <QcAuthorizationForm action={setQcAuthorization.bind(null, u.id)} userName={u.name} qcAuthorized={u.qcAuthorized} />
              </td>
            )}
          </tr>
        ))}
      </Table>
      {!isAdmin && <p className="mt-3 text-sm text-slate-500">Only an admin can change QC authorization.</p>}

      <h2 className="mb-3 mt-8 text-base font-semibold">Audit history</h2>
      <AuditHistory scopes={[{ table: "User", ids: users.map((u) => u.id) }]} />
    </>
  );
}
