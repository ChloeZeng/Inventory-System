"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { USER_COOKIE, getCurrentUser } from "@/lib/current-user";

async function signInAs(userId: number) {
  const user = await prisma.user.findFirst({ where: { id: userId, active: true } });
  if (!user) throw new Error("That user does not exist or is inactive.");
  (await cookies()).set(USER_COOKIE, String(user.id), { httpOnly: true, sameSite: "lax", path: "/" });
}

// Sidebar "Signed in as" switcher.
export async function setCurrentUser(userId: number) {
  await signInAs(userId);
  revalidatePath("/", "layout");
}

// Onboarding "Who are you?": sign in, then show what this user can do.
export async function chooseUser(formData: FormData) {
  await signInAs(Number(formData.get("userId")));
  redirect("/welcome?step=ready");
}

// Onboarding tour finished or skipped: don't start it again for this user.
// "Show tour again" in the sidebar opens /?tour=1, which runs it regardless.
export async function finishTour() {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { tourCompletedAt: new Date() } });
  revalidatePath("/");
}

// Onboarding "Skip the tour".
export async function skipTour() {
  await finishTour();
  redirect("/");
}
