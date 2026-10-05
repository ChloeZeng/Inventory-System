"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { parseCategoryConfig, parseSpecs, sameSpecs, type CategoryConfig } from "@/lib/category-config";
import { nextItemCode } from "@/lib/numbering";
import { auditCreate, auditUpdate } from "@/lib/audit";
import { fileFromForm, saveUpload } from "@/lib/uploads";
import { ITEM_DOCUMENT_TYPES } from "@/lib/constants";
import { createDocument } from "@/lib/documents";
import { type ActionState, bool, errorMessage, str } from "@/lib/forms";

function readSpecs(config: CategoryConfig, formData: FormData) {
  const specs: Record<string, string> = {};
  const fieldErrors: Record<string, string> = {};
  for (const f of config.specFields) {
    const v = str(formData, `spec_${f.key}`);
    if (v) specs[f.key] = v;
    else if (f.required) fieldErrors[`spec_${f.key}`] = `${f.label} is required.`;
  }
  return { specs, fieldErrors };
}

export async function createItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let itemId: number;
  try {
    const user = await requireUser();
    const categoryId = Number(formData.get("categoryId"));
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return { error: "Pick a category." };
    const config = parseCategoryConfig(category.config);

    const { specs, fieldErrors } = readSpecs(config, formData);
    const name = str(formData, "name") ?? Object.values(specs).join(" ");
    if (!name) fieldErrors.name = "Name is required.";
    if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };

    // A new code is only for a new item TYPE. Catch the common mistake of
    // creating a second code for the same lid when a new batch arrives.
    if (config.specFields.length) {
      const existing = await prisma.item.findMany({ where: { categoryId, active: true } });
      const dup = existing.find((i) => sameSpecs(parseSpecs(i.specs), specs));
      if (dup)
        return {
          error: `${dup.code} (${dup.name}) already has these specs. Use that item — a new batch does not need a new item code.`,
        };
    }

    const specSheet = fileFromForm(formData, "specSheet");
    const saved = specSheet ? await saveUpload(specSheet, "items") : null;
    const legacyCode = str(formData, "legacyCode");

    itemId = await prisma.$transaction(async (tx) => {
      const code = await nextItemCode(tx, category.codePrefix);
      const item = await tx.item.create({
        data: { code, name, legacyCode, categoryId, specs: JSON.stringify(specs) },
      });
      await auditCreate(tx, {
        userId: user.id,
        table: "Item",
        recordId: item.id,
        values: { code, name, legacyCode, categoryId, specs },
      });
      if (saved) await createDocument(tx, user.id, saved, "Spec sheet", { itemId: item.id });
      return item.id;
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/items");
  redirect(`/items/${itemId}`);
}

export async function updateItem(itemId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId }, include: { category: true } });
    const config = parseCategoryConfig(item.category.config);

    const { specs, fieldErrors } = readSpecs(config, formData);
    const name = str(formData, "name");
    if (!name) fieldErrors.name = "Name is required.";
    if (!name || Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors };

    const before = {
      name: item.name,
      legacyCode: item.legacyCode,
      specs: parseSpecs(item.specs),
      active: item.active,
    };
    const after = { name, legacyCode: str(formData, "legacyCode"), specs, active: bool(formData, "active") };

    const changed = await prisma.$transaction(async (tx) => {
      const n = await auditUpdate(tx, {
        userId: user.id,
        table: "Item",
        recordId: item.id,
        before,
        after,
        reason: str(formData, "reason") ?? undefined,
      });
      if (n) await tx.item.update({ where: { id: item.id }, data: { ...after, specs: JSON.stringify(specs) } });
      return n;
    });
    revalidatePath("/", "layout");
    return { ok: changed ? `Saved ${changed} change${changed > 1 ? "s" : ""}.` : "No changes." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function uploadItemDocument(itemId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const file = fileFromForm(formData, "file");
    if (!file) return { error: "Choose a file." };
    const type = str(formData, "type") ?? "Spec sheet";
    if (!(ITEM_DOCUMENT_TYPES as readonly string[]).includes(type)) return { error: "Unknown document type." };

    const saved = await saveUpload(file, "items");
    await prisma.$transaction((tx) => createDocument(tx, user.id, saved, type, { itemId }));
    revalidatePath("/", "layout");
    return { ok: `Uploaded ${file.name}.` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
