"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { auditCreate, auditUpdate } from "@/lib/audit";
import { SUPPLIER_TYPES } from "@/lib/constants";
import { type ActionState, bool, errorMessage, str } from "@/lib/forms";

// Only QC / admin may approve or un-approve a supplier on the ASL.
const ASL_ROLES = ["qc", "admin"];

function readSupplier(formData: FormData) {
  const fieldErrors: Record<string, string> = {};
  const name = str(formData, "name");
  if (!name) fieldErrors.name = "Name is required.";
  const type = str(formData, "type") ?? "";
  if (!SUPPLIER_TYPES.some((t) => t.value === type)) fieldErrors.type = "Pick a supplier type.";
  return {
    fieldErrors,
    values: {
      name: name ?? "",
      type,
      aslApproved: bool(formData, "aslApproved"),
      contactName: str(formData, "contactName"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      notes: str(formData, "notes"),
    },
  };
}

export async function createSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let supplierId: number;
  try {
    const user = await requireUser();
    const { values, fieldErrors } = readSupplier(formData);
    if (values.aslApproved && !ASL_ROLES.includes(user.role))
      fieldErrors.aslApproved = "Only QC or admin can mark a supplier as ASL approved.";
    if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };
    if (await prisma.supplier.findUnique({ where: { name: values.name } }))
      return { error: "A supplier with this name already exists.", fieldErrors: { name: "Already exists." } };

    supplierId = await prisma.$transaction(async (tx) => {
      const s = await tx.supplier.create({ data: values });
      await auditCreate(tx, { userId: user.id, table: "Supplier", recordId: s.id, values });
      return s.id;
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/suppliers");
  redirect(`/suppliers/${supplierId}`);
}

export async function updateSupplier(supplierId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const before = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const { values, fieldErrors } = readSupplier(formData);
    const after = { ...values, active: bool(formData, "active") };
    const reason = str(formData, "reason");

    if (after.aslApproved !== before.aslApproved) {
      if (!ASL_ROLES.includes(user.role)) fieldErrors.aslApproved = "Only QC or admin can change ASL approval.";
      else if (!reason) fieldErrors.reason = "A reason is required when changing ASL approval.";
    }
    if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };
    if (after.name !== before.name && (await prisma.supplier.findUnique({ where: { name: after.name } })))
      return { error: "A supplier with this name already exists.", fieldErrors: { name: "Already exists." } };

    const changed = await prisma.$transaction(async (tx) => {
      const n = await auditUpdate(tx, {
        userId: user.id,
        table: "Supplier",
        recordId: supplierId,
        before,
        after,
        reason: reason ?? undefined,
      });
      if (n) await tx.supplier.update({ where: { id: supplierId }, data: after });
      return n;
    });
    revalidatePath("/suppliers");
    revalidatePath(`/suppliers/${supplierId}`);
    return { ok: changed ? `Saved ${changed} change${changed > 1 ? "s" : ""}.` : "No changes." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
