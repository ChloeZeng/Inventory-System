"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { cancelIssue, confirmIssue, createIssue } from "@/lib/material-issue-db";
import { type ActionState, dateOnly, errorMessage, str, toDateInput, todayDateInput } from "@/lib/forms";

// Material issue (usage form for a production run): create → print pick list → confirm.

export async function createIssueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: number;
  try {
    const user = await requireUser();
    const date = dateOnly(formData, "date");
    if (date && toDateInput(date) > todayDateInput()) return { error: "Please fix the highlighted fields.", fieldErrors: { date: "The production date cannot be in the future." } };
    const count = Math.min(Number(formData.get("lineCount")) || 0, 100);
    const lines = Array.from({ length: count }, (_, i) => ({
      itemId: Number(formData.get(`line_${i}_item`)) || 0,
      lotId: Number(formData.get(`line_${i}_lot`)) || 0,
      plannedQty: str(formData, `line_${i}_qty`) ?? "",
      productReason: str(formData, `line_${i}_reason`),
    }));
    const result = await createIssue(prisma, user.id, {
      product: str(formData, "product"),
      client: str(formData, "client"),
      batchNo: str(formData, "batchNo"),
      date,
      notes: str(formData, "notes"),
      lines,
    });
    if ("errors" in result && result.errors) return { error: result.errors.lines ?? "Please fix the highlighted fields.", fieldErrors: result.errors };
    id = result.id!;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/issues/${id}?created=1`);
}

export async function confirmIssueAction(issueId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const lines = await prisma.materialIssueLine.findMany({ where: { issueId }, select: { id: true } });
    const inputs = Object.fromEntries(
      lines.map((l) => [l.id, { actual: str(formData, `actual_${l.id}`) ?? "", loss: str(formData, `loss_${l.id}`) ?? "", returned: str(formData, `returned_${l.id}`) ?? "" }]),
    );
    const result = await confirmIssue(prisma, user.id, issueId, inputs, str(formData, "confirmNote"));
    if ("errors" in result && result.errors) return { error: result.errors.form ?? "Please fix the highlighted fields.", fieldErrors: result.errors };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/issues/${issueId}?done=confirmed`);
}

export async function cancelIssueAction(issueId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const reason = str(formData, "reason");
    if (!reason) return { error: "Give the reason for cancelling.", fieldErrors: { reason: "Required." } };
    const result = await cancelIssue(prisma, user.id, issueId, reason);
    if ("error" in result) return { error: result.error };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/issues/${issueId}?done=cancelled`);
}
