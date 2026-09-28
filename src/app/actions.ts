"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { USER_COOKIE } from "@/lib/current-user";

export async function setCurrentUser(userId: number) {
  (await cookies()).set(USER_COOKIE, String(userId), { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
