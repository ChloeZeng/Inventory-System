import { cookies } from "next/headers";
import { prisma } from "./prisma";

// Demo login: the user picked in the header is stored in a cookie.
// Later: replace with Google Workspace login.
export const USER_COOKIE = "svlsg_user";

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
