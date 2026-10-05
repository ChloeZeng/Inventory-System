"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/current-user";
import { auditUpdate } from "@/lib/audit";
import { type ActionState, errorMessage, str } from "@/lib/forms";

// Grant or remove QC authorization. Admin only, reason required, written to the AuditLog.
export async function setQcAuthorization(userId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const qcAuthorized = formData.get("qcAuthorized") === "yes";
    if (qcAuthorized === target.qcAuthorized) return { ok: "No change." };
    const reason = str(formData, "reason");
    if (!reason) return { error: "Give a reason — it is saved in the audit trail.", fieldErrors: { reason: "Required." } };

    await prisma.$transaction(async (tx) => {
      await auditUpdate(tx, {
        userId: admin.id,
        table: "User",
        recordId: target.id,
        before: { qcAuthorized: target.qcAuthorized },
        after: { qcAuthorized },
        reason,
      });
      await tx.user.update({ where: { id: target.id }, data: { qcAuthorized } });
    });
    revalidatePath("/", "layout");
    return { ok: qcAuthorized ? `${target.name} is now QC authorized.` : `${target.name} is no longer QC authorized.` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
