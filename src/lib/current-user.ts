import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { QC_AUTH_REQUIRED } from "./constants";
import { USER_COOKIE } from "./cookies";

// Demo login: the user chosen on the welcome screen (or in the sidebar) is stored in a cookie.
// Later: replace with Google Workspace login.
export { USER_COOKIE };

export async function getCurrentUser() {
  const id = Number((await cookies()).get(USER_COOKIE)?.value);
  if (id) {
    const user = await prisma.user.findFirst({ where: { id, active: true } });
    if (user) return user;
  }
  return null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Pick a user in the top bar first.");
  return user;
}

// Server-side gate for QC decisions: inspection disposition, release / reject,
// resolving QC follow-ups and ASL approval. The UI disables these buttons too,
// but a server action can be called directly, so it must check again.
export async function requireQcAuthorized() {
  const user = await requireUser();
  if (!user.qcAuthorized) throw new Error(`${QC_AUTH_REQUIRED}.`);
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Only an admin can manage users.");
  return user;
}
