"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { startAdhocCount, submitCount } from "@/lib/stock-count-db";
import { type ActionState, dateOnly, errorMessage, str, toDateInput, todayDateInput } from "@/lib/forms";

export async function startCountAction() {
  const user = await requireUser();
  const id = await startAdhocCount(prisma, user.id);
  revalidatePath("/", "layout");
  redirect(`/counts/${id}`);
}

export async function submitCountAction(countId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const countDate = dateOnly(formData, "countDate");
    if (!countDate) return { error: "Enter the date of the count.", fieldErrors: { countDate: "Required." } };
    if (toDateInput(countDate) > todayDateInput()) return { error: "The count date cannot be in the future.", fieldErrors: { countDate: "Not in the future." } };
    const lotIds = formData.getAll("lotId").map(Number).filter(Boolean);
    const entries = lotIds.map((lotId) => ({
      lotId,
      shownQty: Number(formData.get(`system_${lotId}`)),
      counted: str(formData, `counted_${lotId}`) ?? "",
      reason: str(formData, `reason_${lotId}`),
    }));
    const result = await submitCount(prisma, user.id, countId, entries, countDate, str(formData, "notes"));
    if ("errors" in result && result.errors) {
      const n = Object.keys(result.errors).filter((k) => k.startsWith("lot_")).length;
      return { error: result.errors.form ?? `${n === 1 ? "1 line needs" : `${n} lines need`} attention.`, fieldErrors: result.errors };
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/counts/${countId}?done=1`);
}
