// The Home page "My to-do" list: every open requirement turned into one
// action, linking straight to the fix. QC decisions (owner "qc") are listed
// only for QC-authorized users; everything else is for everyone.

import { prisma } from "./prisma";
import { ownerOf, ownerOfOpen, type Owner } from "./completeness";
import { loadAnsiTables, samplingPlan } from "./sampling";
import {
  LOT_INCLUDE,
  fixHref,
  fixHrefFor,
  fixVerb,
  isReceiptLevel,
  itemChecklist,
  lotLabel,
  lotStatus,
  supplierChecklist,
} from "./records";
import { formatDate } from "@/components/ui";

export type Todo = {
  key: string;
  title: string;
  context: string;
  href: string;
  owner: Owner;
  ref?: string;
  kind: "inspect" | "release" | "reject" | "missing";
};

// "Packing list / COA" → "packing list / COA", but keep "PO / invoice no." and "F.WD.003".
function lcFirst(s: string) {
  return /^[A-Z][A-Z.]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

export async function loadTodos(): Promise<Todo[]> {
  const [lots, items, suppliers, tables] = await Promise.all([
    prisma.lot.findMany({
      where: { qcStatus: "Quarantine" },
      include: LOT_INCLUDE,
      orderBy: [{ receipt: { dateReceived: "asc" } }, { id: "asc" }],
    }),
    prisma.item.findMany({
      where: { active: true },
      include: { category: true, documents: { select: { type: true } }, _count: { select: { lots: { where: { qcStatus: "Quarantine" } } } } },
      orderBy: { code: "asc" },
    }),
    prisma.supplier.findMany({
      where: { active: true },
      include: { documents: { select: { type: true } } },
      orderBy: { name: "asc" },
    }),
    loadAnsiTables(prisma),
  ]);

  const qcActions: Todo[] = [];
  const lotMissing: Todo[] = [];

  for (const lot of lots) {
    const { summary, progress } = lotStatus(lot);
    const label = lotLabel(lot);
    const context = `${lot.item.code} ${lot.item.name} · ${lot.receipt.receivingNo} · received ${formatDate(lot.receipt.dateReceived)}`;

    if (progress.next === "inspect" || (progress.next === "finish_receiving" && !lot.inspections.length)) {
      let samples = "";
      try {
        const plan = samplingPlan(tables, lot.qtyReceived);
        samples = plan.hundredPercent ? " (100% inspection)" : ` (${plan.sampleSize.toLocaleString()} samples)`;
      } catch {
        // ANSI tables incomplete — still list the inspection
      }
      qcActions.push({
        key: `inspect-${lot.id}`,
        title: `Inspect lot ${label}${samples}`,
        context,
        href: `/lots/${lot.id}?tab=inspection`,
        owner: "qc",
        ref: "F.WD.003",
        kind: "inspect",
      });
    }
    if (progress.next === "release")
      qcActions.push({ key: `release-${lot.id}`, title: `Release lot ${label}`, context, href: `/lots/${lot.id}?do=release`, owner: "qc", kind: "release" });
    if (progress.next === "reject")
      qcActions.push({ key: `reject-${lot.id}`, title: `Reject lot ${label} — inspection failed`, context, href: `/lots/${lot.id}?do=reject`, owner: "qc", kind: "reject" });

    for (const r of summary.open) {
      // inspections are listed above; item paperwork is listed once per item below
      if (r.req.source === "inspection" || r.req.attachedTo === "item") continue;
      const subject = isReceiptLevel(r) ? lot.receipt.receivingNo : `lot ${label}`;
      lotMissing.push({
        key: `lot-${lot.id}-${r.req.key}`,
        title:
          r.status === "followup"
            ? `Resolve “${r.req.label}” for ${subject}${r.detail ? ` (${r.detail})` : ""}`
            : `${fixVerb(r.req)} ${lcFirst(r.req.label)} for ${subject}`,
        context,
        href: fixHrefFor(r, { lotId: lot.id }),
        owner: ownerOfOpen(r),
        ref: r.req.ref,
        kind: "missing",
      });
    }
  }

  const itemTodos: Todo[] = [];
  for (const item of items) {
    const { open } = itemChecklist(item);
    const byOwner = Map.groupBy(open, (r) => ownerOf(r.req));
    for (const [owner, rows] of byOwner) {
      const blocking = item._count.lots ? ` · blocks release of ${item._count.lots} lot${item._count.lots > 1 ? "s" : ""}` : "";
      itemTodos.push({
        key: `item-${item.id}-${owner}`,
        title:
          rows.length === 1
            ? `${fixVerb(rows[0].req)} ${lcFirst(rows[0].req.label)} for ${item.code}`
            : `Complete item ${item.code}: ${rows.map((r) => lcFirst(r.req.label)).join(", ")}`,
        context: `${item.name} · ${item.category.name}${blocking}`,
        href: fixHref(rows[0].req, { itemId: item.id }),
        owner,
        ref: rows.length === 1 ? rows[0].req.ref : undefined,
        kind: "missing",
      });
    }
  }

  const supplierTodos: Todo[] = [];
  for (const s of suppliers) {
    const { open: missing } = supplierChecklist(s);
    if (!missing.length) continue;
    supplierTodos.push({
      key: `supplier-${s.id}`,
      title:
        missing.length === 1
          ? `${fixVerb(missing[0].req)} ${lcFirst(missing[0].req.label)} for ${s.name}`
          : `Complete supplier ${s.name}: ${missing.map((r) => `${lcFirst(r.req.label)} (${r.req.ref})`).join(", ")}`,
      context: s.aslApproved ? "Supplier file" : "Not on the Approved Supplier List — receiving shows a warning",
      href: fixHref(missing[0].req, { supplierId: s.id }),
      owner: ownerOf(missing[0].req),
      ref: missing.length === 1 ? missing[0].req.ref : undefined,
      kind: "missing",
    });
  }

  return [...qcActions, ...lotMissing, ...itemTodos, ...supplierTodos];
}

export function todosForUser(todos: Todo[], user: { qcAuthorized: boolean }) {
  return user.qcAuthorized ? todos : todos.filter((t) => t.owner === "anyone");
}
