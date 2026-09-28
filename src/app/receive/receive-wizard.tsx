"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import type { Requirement, SpecField, Stage } from "@/lib/category-config";
import { sameSpecs } from "@/lib/category-config";
import { evaluate, type CheckResult, type Facts } from "@/lib/completeness";
import { SEGREGATION, SUPPLIER_TYPES, segregationLabel, supplierTypeLabel } from "@/lib/constants";
import type { ActionState } from "@/lib/forms";
import { Badge, Field, FormMessage, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { receiveDelivery } from "./actions";

export type WizardData = {
  categories: { id: number; name: string; codePrefix: string; specFields: SpecField[]; requirements: Record<Stage, Requirement[]> }[];
  items: {
    id: number;
    code: string;
    name: string;
    legacyCode: string | null;
    categoryId: number;
    specs: Record<string, string>;
    docTypes: string[];
    lotCount: number;
  }[];
  suppliers: { id: number; name: string; type: string; aslApproved: boolean }[];
  locations: { id: number; name: string }[];
  today: string;
  receipt: {
    id: number;
    receivingNo: string;
    supplierName: string;
    dateReceived: string;
    lotCount: number;
    facts: Record<string, unknown>;
    docTypes: string[];
  } | null;
};

type StepKey = "category" | "item" | "supplier" | "delivery" | "batch" | "storage" | "review";
type FileKey = "specSheet" | "truckFile" | "boxPhoto" | "packingList" | "coa";

const STEPS: { key: StepKey; title: string; short: string; receiptLevel?: boolean }[] = [
  { key: "category", title: "What are you receiving?", short: "Category" },
  { key: "item", title: "Is this an item we already have?", short: "Item" },
  { key: "supplier", title: "Who is the supplier?", short: "Supplier", receiptLevel: true },
  { key: "delivery", title: "About the delivery", short: "Delivery", receiptLevel: true },
  { key: "batch", title: "Batch and quantity", short: "Batch & qty" },
  { key: "storage", title: "Storage, labels and paperwork", short: "Storage & docs" },
  { key: "review", title: "Review and save", short: "Review" },
];

// Which step asks for each field — used to send server-side errors back to the right screen.
const FIELD_STEP: Record<string, StepKey> = {
  supplierId: "supplier",
  supplierType: "supplier",
  dateReceived: "delivery",
  carrierInspection: "delivery",
  supplierBatchNo: "batch",
  cases: "batch",
  unitsPerCase: "batch",
  qtyOverrideReason: "batch",
  qtyMatches: "batch",
  qtyMatchNote: "batch",
  unitCost: "batch",
  expDate: "batch",
  segregation: "storage",
  locationId: "storage",
  boxPhoto: "storage",
  quarantineSticker: "storage",
};

// Requirement → the step that answers it, for "Go fix" links on the review screen.
function stepForRequirement(req: Requirement): StepKey {
  if (req.source === "document") return req.attachedTo === "item" ? "item" : req.attachedTo === "receipt" ? "delivery" : "storage";
  const path = req.path ?? req.anyOf?.[0] ?? "";
  if (path.startsWith("item.")) return "item";
  const field = path.split(".").pop() ?? "";
  if (field === "carrierInspectionDone" || field === "poInvoiceNo") return "delivery";
  if (field === "quarantineStickerApplied") return "storage";
  if (field === "qtyMatchesPackingList") return "batch";
  if (field === "supplierBatchNo" || field === "lotNo") return "batch";
  return FIELD_STEP[field] ?? "review";
}

const num = (s: string) => {
  const t = s.replace(/,/g, "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};

export function ReceiveWizard({ data }: { data: WizardData }) {
  const receipt = data.receipt;
  const steps = STEPS.filter((s) => !(receipt && s.receiptLevel));
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState<ActionState, FormData>(receiveDelivery, {});
  const topRef = useRef<HTMLDivElement>(null);

  const [d, setD] = useState({
    categoryId: data.categories.length === 1 ? data.categories[0].id : (null as number | null),
    itemMode: "existing" as "existing" | "new",
    itemId: null as number | null,
    itemSearch: "",
    specs: {} as Record<string, string>,
    itemName: "",
    supplierId: null as number | null,
    supplierType: "",
    dateReceived: data.today,
    carrierInspection: "" as "" | "yes" | "no",
    poInvoiceNo: "",
    trackingNo: "",
    supplierBatchNo: "",
    lotNo: "",
    mfgDate: "",
    expDate: "",
    cases: "",
    unitsPerCase: "",
    overrideQty: false,
    qtyReceived: "",
    qtyOverrideReason: "",
    qtyMatches: "" as "" | "yes" | "no",
    qtyMatchNote: "",
    unitCost: "",
    segregation: "",
    locationId: null as number | null,
    quarantineSticker: false,
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const [files, setFiles] = useState<Record<FileKey, string | null>>({
    specSheet: null,
    truckFile: null,
    boxPhoto: null,
    packingList: null,
    coa: null,
  });

  // Server-side validation errors: show them on the step that asks the question
  // (adjusting state during render when a new server result arrives).
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.fieldErrors) {
      setErrors(state.fieldErrors);
      const first = Object.keys(state.fieldErrors)[0];
      const target = first?.startsWith("spec_") ? "item" : FIELD_STEP[first];
      const idx = steps.findIndex((s) => s.key === target);
      if (idx >= 0) setStepIdx(idx);
    }
  }

  const category = data.categories.find((c) => c.id === d.categoryId) ?? null;
  const categoryItems = data.items.filter((i) => i.categoryId === d.categoryId);
  const item = d.itemMode === "existing" ? (categoryItems.find((i) => i.id === d.itemId) ?? null) : null;
  const supplier = data.suppliers.find((s) => s.id === d.supplierId) ?? null;
  const location = data.locations.find((l) => l.id === d.locationId) ?? null;
  const cases = num(d.cases);
  const unitsPerCase = num(d.unitsPerCase);
  const calculated = cases && unitsPerCase ? cases * unitsPerCase : null;
  const qtyReceived = d.overrideQty ? num(d.qtyReceived) : calculated;
  const duplicate =
    d.itemMode === "new" && category?.specFields.length
      ? categoryItems.find((i) => sameSpecs(i.specs, d.specs))
      : undefined;

  const search = d.itemSearch.trim().toLowerCase();
  const filteredItems = search
    ? categoryItems.filter((i) =>
        [i.code, i.name, i.legacyCode ?? "", ...Object.values(i.specs)].some((s) => s.toLowerCase().includes(search)),
      )
    : categoryItems;

  // Same completeness rules the server uses, run on the draft.
  const facts: Facts = {
    item: { specs: item ? item.specs : d.specs },
    receipt: receipt
      ? receipt.facts
      : {
          supplierId: d.supplierId,
          dateReceived: d.dateReceived || null,
          carrierInspectionDone: d.carrierInspection === "" ? null : d.carrierInspection === "yes",
          poInvoiceNo: d.poInvoiceNo,
          qtyMatchesPackingList: d.qtyMatches === "" ? null : d.qtyMatches === "yes",
          segregation: d.segregation,
          quarantineStickerApplied: d.quarantineSticker,
        },
    lot: {
      supplierBatchNo: d.supplierBatchNo,
      lotNo: d.lotNo,
      cases,
      unitsPerCase,
      locationId: d.locationId,
      unitCost: d.unitCost,
    },
    supplier: supplier ?? undefined,
    documents: {
      item: item ? item.docTypes : files.specSheet ? ["Spec sheet"] : [],
      receipt: receipt ? receipt.docTypes : files.truckFile ? ["F.WD.001"] : [],
      lot: [files.boxPhoto && "Photo", files.packingList && "Packing list", files.coa && "COA"].filter((t): t is string => !!t),
    },
    inspections: [],
  };
  const atReceiving = category ? evaluate("at_receiving", category.requirements.at_receiving, facts) : [];
  const beforeRelease = category ? evaluate("before_release", category.requirements.before_release, facts) : [];
  const blocking = atReceiving.filter((r) => r.status === "missing");
  const later = beforeRelease.filter((r) => r.status === "missing");

  function validate(key: StepKey): Record<string, string> {
    const e: Record<string, string> = {};
    if (key === "category" && !category) e.categoryId = "Pick what you are receiving.";
    if (key === "item") {
      if (d.itemMode === "existing" && !item) e.itemId = "Pick the item, or choose “New item” if it is not in the list.";
      if (d.itemMode === "new") {
        for (const f of category?.specFields ?? []) if (f.required && !d.specs[f.key]?.trim()) e[`spec_${f.key}`] = `${f.label} is required.`;
        if (duplicate) e.itemId = `${duplicate.code} already has these specs — pick it instead.`;
      }
    }
    if (key === "supplier") {
      if (!supplier) e.supplierId = "Pick the supplier.";
      if (!d.supplierType) e.supplierType = "Pick one.";
    }
    if (key === "delivery") {
      if (!d.dateReceived) e.dateReceived = "Enter the date received.";
      if (!d.carrierInspection) e.carrierInspection = "Answer yes or no.";
    }
    if (key === "batch") {
      if (!d.supplierBatchNo.trim() && !d.lotNo.trim()) e.supplierBatchNo = "Enter the supplier batch no., the lot no., or both.";
      if (d.mfgDate && d.expDate && d.expDate <= d.mfgDate) e.expDate = "Exp date must be after mfg date.";
      if (!cases) e.cases = "Enter the number of cases (1 or more).";
      if (!unitsPerCase) e.unitsPerCase = "Enter units per case (1 or more).";
      if (d.overrideQty) {
        if (!num(d.qtyReceived)) e.qtyReceived = "Enter the actual total.";
        else if (num(d.qtyReceived) !== calculated && !d.qtyOverrideReason.trim()) e.qtyOverrideReason = "Say why the total differs.";
      }
      if (!receipt && !d.qtyMatches) e.qtyMatches = "Answer yes or no.";
      if (!receipt && d.qtyMatches === "no" && !d.qtyMatchNote.trim()) e.qtyMatchNote = "Describe the shortage or difference.";
      if (d.unitCost && !/^\$?\d+(\.\d+)?$/.test(d.unitCost.replace(/,/g, "").trim())) e.unitCost = "Enter a number, e.g. 0.0125";
    }
    if (key === "storage") {
      if (!receipt && !d.segregation) e.segregation = "Pick one — “None” if nothing special.";
      if (!location) e.locationId = "Pick where the lot is stored.";
    }
    return e;
  }

  function goTo(idx: number) {
    setErrors({});
    setStepIdx(idx);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function next() {
    const e = validate(step.key);
    setErrors(e);
    if (Object.keys(e).length === 0) goTo(stepIdx + 1);
  }

  // A step can be jumped to if every step before it is answered.
  const reachable = (idx: number) => steps.slice(0, idx).every((s) => Object.keys(validate(s.key)).length === 0);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.key !== "review") return next();
    const fd = new FormData(e.currentTarget);
    // Dispatch manually so React does not reset the form (and its chosen files) if the server rejects it.
    startTransition(() => formAction(fd));
  }

  const err = (k: string) => errors[k];
  const show = (k: StepKey) => (step.key === k ? "" : "hidden");
  const onFile = (k: FileKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFiles((f) => ({ ...f, [k]: e.target.files?.[0]?.name ?? null }));

  return (
    <div ref={topRef} className="grid scroll-mt-4 gap-6 lg:grid-cols-[220px_1fr]">
      {/* Step list */}
      <nav aria-label="Receiving steps" className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 text-xs text-slate-500 lg:hidden">
          Step {stepIdx + 1} of {steps.length}
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200 lg:hidden">
          <div className="h-full bg-sky-600" style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }} />
        </div>
        <ol className="hidden space-y-1 lg:block">
          {steps.map((s, i) => {
            const done = i < stepIdx;
            const current = i === stepIdx;
            const canGo = i <= stepIdx || reachable(i);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={!canGo}
                  onClick={() => goTo(i)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                    current ? "bg-sky-700 font-medium text-white" : done ? "text-slate-700 hover:bg-slate-100" : "text-slate-400"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      current ? "bg-white text-sky-700" : done ? "bg-emerald-500 text-white" : "border border-slate-300"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  {s.short}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          // Enter moves to the next question instead of submitting half a receipt.
          if (e.key === "Enter" && e.target instanceof HTMLInputElement && step.key !== "review") {
            e.preventDefault();
            next();
          }
        }}
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Step {stepIdx + 1} of {steps.length}
        </p>
        <h2 className="mb-5 mt-1 text-xl font-semibold">{step.title}</h2>

        {receipt && <input type="hidden" name="receiptId" value={receipt.id} />}
        <input type="hidden" name="itemMode" value={d.itemMode} />
        <input type="hidden" name="qtyReceived" value={qtyReceived ?? ""} />

        {/* 1. Category */}
        <div className={show("category")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.categories.map((c) => (
              <Choice
                key={c.id}
                name="categoryId"
                value={c.id}
                checked={d.categoryId === c.id}
                onChange={() => setD((p) => ({ ...p, categoryId: c.id, itemId: null, specs: {} }))}
                title={c.name}
                subtitle={`${c.codePrefix}-### · ${data.items.filter((i) => i.categoryId === c.id).length} items`}
              />
            ))}
          </div>
          <FieldError msg={err("categoryId")} />
        </div>

        {/* 2. Item */}
        <div className={`space-y-4 ${show("item")}`}>
          {category && (
            <>
              <input
                className={inputClass}
                placeholder={`Search ${category.name.toLowerCase()} by code, size, color…`}
                value={d.itemSearch}
                onChange={(e) => set("itemSearch", e.target.value)}
              />
              <div className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
                {filteredItems.map((i) => (
                  <Choice
                    key={i.id}
                    name="itemId"
                    value={i.id}
                    checked={d.itemMode === "existing" && d.itemId === i.id}
                    onChange={() => setD((p) => ({ ...p, itemMode: "existing", itemId: i.id }))}
                    title={
                      <span>
                        <span className="font-mono">{i.code}</span> {i.name}
                      </span>
                    }
                    subtitle={
                      <>
                        {category.specFields.map((f) => i.specs[f.key]).filter(Boolean).join(" · ") || "no specs yet"}
                        {i.legacyCode && <span className="font-mono"> · {i.legacyCode}</span>}
                        {" · "}
                        {i.docTypes.includes("Spec sheet") ? "spec sheet on file" : "no spec sheet"}
                      </>
                    }
                  />
                ))}
                {filteredItems.length === 0 && <p className="text-sm text-slate-500">No existing item matches “{d.itemSearch}”.</p>}
              </div>
              <Choice
                name="itemModeNew"
                value="new"
                checked={d.itemMode === "new"}
                onChange={() => setD((p) => ({ ...p, itemMode: "new", itemId: null }))}
                title="New item — it is not in the list"
                subtitle={`Only for a new item type. It gets the next ${category.codePrefix}-### code when you save.`}
              />
              <FieldError msg={err("itemId")} />

              {d.itemMode === "new" && (
                <div className="space-y-4 rounded-md border border-sky-200 bg-sky-50/50 p-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {category.specFields.map((f) => (
                      <Field key={f.key} label={f.label} htmlFor={`spec_${f.key}`} required={f.required} error={err(`spec_${f.key}`)}>
                        {f.type === "select" && f.options ? (
                          <select
                            id={`spec_${f.key}`}
                            name={`spec_${f.key}`}
                            className={inputClass}
                            value={d.specs[f.key] ?? ""}
                            onChange={(e) => set("specs", { ...d.specs, [f.key]: e.target.value })}
                          >
                            <option value="">—</option>
                            {f.options.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`spec_${f.key}`}
                            name={`spec_${f.key}`}
                            className={inputClass}
                            value={d.specs[f.key] ?? ""}
                            onChange={(e) => set("specs", { ...d.specs, [f.key]: e.target.value })}
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                  {duplicate && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <strong>{duplicate.code}</strong> ({duplicate.name}) already has these specs.{" "}
                      <button
                        type="button"
                        className="font-medium text-sky-700 underline"
                        onClick={() => setD((p) => ({ ...p, itemMode: "existing", itemId: duplicate.id }))}
                      >
                        Use {duplicate.code} instead
                      </button>
                    </div>
                  )}
                  <Field label="Item name" htmlFor="itemName" hint="Leave blank to build it from the specs above.">
                    <input id="itemName" name="itemName" className={inputClass} value={d.itemName} onChange={(e) => set("itemName", e.target.value)} />
                  </Field>
                </div>
              )}
              {/* kept mounted so the chosen file survives moving between steps */}
              <div className={d.itemMode === "new" ? "" : "hidden"}>
                <Field label="Spec sheet" htmlFor="specSheet" hint="Optional now — needed before any lot of this item can be released.">
                  <input id="specSheet" name="specSheet" type="file" className="text-sm" onChange={onFile("specSheet")} />
                </Field>
              </div>
            </>
          )}
        </div>

        {/* 3. Supplier */}
        {!receipt && (
          <div className={`space-y-4 ${show("supplier")}`}>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.suppliers.map((s) => (
                <Choice
                  key={s.id}
                  name="supplierId"
                  value={s.id}
                  checked={d.supplierId === s.id}
                  onChange={() => setD((p) => ({ ...p, supplierId: s.id, supplierType: s.type }))}
                  title={s.name}
                  subtitle={
                    <>
                      {supplierTypeLabel(s.type)} · {s.aslApproved ? "ASL approved" : <span className="text-red-700">not ASL approved</span>}
                    </>
                  }
                />
              ))}
            </div>
            <FieldError msg={err("supplierId")} />
            {supplier && !supplier.aslApproved && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <strong>{supplier.name} is not on the Approved Supplier List.</strong> You can still receive and quarantine the delivery,
                but tell QC — the supplier needs ASL approval (F.QC.010).
              </div>
            )}
            {supplier && (
              <Field label="SVLSG supplier or customer-supplied?" error={err("supplierType")} hint="Filled in from the supplier — change it only for this delivery.">
                <div className="flex flex-wrap gap-2">
                  {SUPPLIER_TYPES.map((t) => (
                    <Pill key={t.value} name="supplierType" value={t.value} checked={d.supplierType === t.value} onChange={() => set("supplierType", t.value)}>
                      {t.label}
                    </Pill>
                  ))}
                </div>
              </Field>
            )}
          </div>
        )}

        {/* 4. Delivery */}
        {!receipt && (
          <div className={`space-y-5 ${show("delivery")}`}>
            <Field label="Date received" htmlFor="dateReceived" required error={err("dateReceived")}>
              <input
                id="dateReceived"
                name="dateReceived"
                type="date"
                className={`${inputClass} max-w-xs`}
                value={d.dateReceived}
                onChange={(e) => set("dateReceived", e.target.value)}
              />
            </Field>
            <Field label="Was the truck inspected (F.WD.001)?" required error={err("carrierInspection")}>
              <div className="flex gap-2">
                <Pill name="carrierInspection" value="yes" checked={d.carrierInspection === "yes"} onChange={() => set("carrierInspection", "yes")}>
                  Yes
                </Pill>
                <Pill name="carrierInspection" value="no" checked={d.carrierInspection === "no"} onChange={() => set("carrierInspection", "no")}>
                  No
                </Pill>
              </div>
            </Field>
            {d.carrierInspection === "no" && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                The receipt can’t be saved until the carrier inspection (F.WD.001) is done. If the truck failed, reject the delivery at
                the dock instead of receiving it.
              </p>
            )}
            <Field label="F.WD.001 form" htmlFor="truckFile" hint="Optional — photo or scan of the completed form.">
              <input id="truckFile" name="truckFile" type="file" accept="image/*,application/pdf" className="text-sm" onChange={onFile("truckFile")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="PO / invoice no." htmlFor="poInvoiceNo" hint="Needed before release — skip it if you don’t have it yet.">
                <input id="poInvoiceNo" name="poInvoiceNo" className={inputClass} value={d.poInvoiceNo} onChange={(e) => set("poInvoiceNo", e.target.value)} />
              </Field>
              <Field label="Tracking no." htmlFor="trackingNo" hint="Optional">
                <input id="trackingNo" name="trackingNo" className={inputClass} value={d.trackingNo} onChange={(e) => set("trackingNo", e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {/* 5. Batch & quantity */}
        <div className={`space-y-5 ${show("batch")}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier batch no." htmlFor="supplierBatchNo" error={err("supplierBatchNo")} hint="At least one of these two.">
              <input id="supplierBatchNo" name="supplierBatchNo" className={inputClass} value={d.supplierBatchNo} onChange={(e) => set("supplierBatchNo", e.target.value)} />
            </Field>
            <Field label="Lot no." htmlFor="lotNo">
              <input id="lotNo" name="lotNo" className={inputClass} value={d.lotNo} onChange={(e) => set("lotNo", e.target.value)} />
            </Field>
            <Field label="Mfg date" htmlFor="mfgDate" hint="Optional">
              <input id="mfgDate" name="mfgDate" type="date" className={inputClass} value={d.mfgDate} onChange={(e) => set("mfgDate", e.target.value)} />
            </Field>
            <Field label="Exp date" htmlFor="expDate" hint="Optional" error={err("expDate")}>
              <input id="expDate" name="expDate" type="date" className={inputClass} value={d.expDate} onChange={(e) => set("expDate", e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How many cases?" htmlFor="cases" required error={err("cases")}>
              <input id="cases" name="cases" inputMode="numeric" className={inputClass} value={d.cases} onChange={(e) => set("cases", e.target.value)} />
            </Field>
            <Field label="How many units per case?" htmlFor="unitsPerCase" required error={err("unitsPerCase")}>
              <input id="unitsPerCase" name="unitsPerCase" inputMode="numeric" className={inputClass} value={d.unitsPerCase} onChange={(e) => set("unitsPerCase", e.target.value)} />
            </Field>
          </div>
          <div className="rounded-md bg-slate-50 px-4 py-3">
            <div className="text-sm text-slate-600">Total units received</div>
            <div className="text-2xl font-semibold tabular-nums">
              {calculated ? (
                <>
                  {cases!.toLocaleString()} × {unitsPerCase!.toLocaleString()} = {calculated.toLocaleString()}
                </>
              ) : (
                "—"
              )}
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.overrideQty} onChange={(e) => set("overrideQty", e.target.checked)} />
              The actual count is different (e.g. a short case)
            </label>
            {d.overrideQty && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Actual total units" htmlFor="qtyReceivedInput" required error={err("qtyReceived")}>
                  <input id="qtyReceivedInput" inputMode="numeric" className={inputClass} value={d.qtyReceived} onChange={(e) => set("qtyReceived", e.target.value)} />
                </Field>
                <Field label="Reason" htmlFor="qtyOverrideReason" required error={err("qtyOverrideReason")} hint="Saved in the audit trail.">
                  <input id="qtyOverrideReason" name="qtyOverrideReason" className={inputClass} value={d.qtyOverrideReason} onChange={(e) => set("qtyOverrideReason", e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          {!receipt && (
            <Field label="Does the total match the packing list / PO?" required error={err("qtyMatches")}>
              <div className="flex gap-2">
                <Pill name="qtyMatches" value="yes" checked={d.qtyMatches === "yes"} onChange={() => set("qtyMatches", "yes")}>
                  Yes
                </Pill>
                <Pill name="qtyMatches" value="no" checked={d.qtyMatches === "no"} onChange={() => set("qtyMatches", "no")}>
                  No
                </Pill>
              </div>
            </Field>
          )}
          {!receipt && d.qtyMatches === "no" && (
            <Field label="What is different?" htmlFor="qtyMatchNote" required error={err("qtyMatchNote")} hint="Shortages and overages go here.">
              <textarea id="qtyMatchNote" name="qtyMatchNote" rows={2} className={inputClass} value={d.qtyMatchNote} onChange={(e) => set("qtyMatchNote", e.target.value)} />
            </Field>
          )}

          <Field label="Unit cost (per unit)" htmlFor="unitCost" error={err("unitCost")} hint="Needed before release — skip it if you don’t have it yet.">
            <div className="flex max-w-xs items-center gap-2">
              <span className="text-slate-500">$</span>
              <input id="unitCost" name="unitCost" inputMode="decimal" className={inputClass} value={d.unitCost} onChange={(e) => set("unitCost", e.target.value)} placeholder="0.0125" />
            </div>
          </Field>
          {qtyReceived && d.unitCost && !err("unitCost") && Number(d.unitCost) > 0 && (
            <p className="text-sm text-slate-600">
              Lot value: {(qtyReceived * Number(d.unitCost)).toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </p>
          )}
        </div>

        {/* 6. Storage & documents */}
        <div className={`space-y-5 ${show("storage")}`}>
          {!receipt && (
            <Field label="Any special segregation needed?" required error={err("segregation")}>
              <div className="flex flex-wrap gap-2">
                {SEGREGATION.map((s) => (
                  <Pill key={s.value} name="segregation" value={s.value} checked={d.segregation === s.value} onChange={() => set("segregation", s.value)}>
                    {s.label}
                  </Pill>
                ))}
              </div>
            </Field>
          )}
          <Field label="Which location?" required error={err("locationId")}>
            <div className="flex flex-wrap gap-2">
              {data.locations.map((l) => (
                <Pill key={l.id} name="locationId" value={l.id} checked={d.locationId === l.id} onChange={() => set("locationId", l.id)}>
                  {l.name}
                </Pill>
              ))}
            </div>
          </Field>
          <Field label="Photo of the box label" htmlFor="boxPhoto" required hint="On a phone this opens the camera.">
            <input id="boxPhoto" name="boxPhoto" type="file" accept="image/*" capture="environment" className="text-sm" onChange={onFile("boxPhoto")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Packing list" htmlFor="packingList" hint="Packing list or COA is needed before release.">
              <input id="packingList" name="packingList" type="file" className="text-sm" onChange={onFile("packingList")} />
            </Field>
            <Field label="COA" htmlFor="coa" hint="Optional if you have the packing list.">
              <input id="coa" name="coa" type="file" className="text-sm" onChange={onFile("coa")} />
            </Field>
          </div>
          {!receipt && (
            <label className={`flex items-start gap-3 rounded-md border p-4 text-sm ${d.quarantineSticker ? "border-emerald-300 bg-emerald-50" : "border-slate-300"}`}>
              <input
                type="checkbox"
                name="quarantineSticker"
                className="mt-0.5 h-5 w-5"
                checked={d.quarantineSticker}
                onChange={(e) => set("quarantineSticker", e.target.checked)}
              />
              <span>
                <span className="font-medium">A QUARANTINE sticker is on every box.</span>
                <span className="block text-slate-500">Required before saving. Nothing can be used until QC releases the lot.</span>
              </span>
            </label>
          )}
        </div>

        {/* 7. Review */}
        {step.key === "review" && category && (
          <div className="space-y-6">
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <Summary label="Item" onEdit={() => goTo(steps.findIndex((s) => s.key === "item"))}>
                {item ? (
                  <>
                    <span className="font-mono">{item.code}</span> {item.name}
                  </>
                ) : (
                  <>
                    New {category.codePrefix}-### —{" "}
                    {d.itemName || category.specFields.map((f) => d.specs[f.key]).filter(Boolean).join(" ")}
                  </>
                )}
              </Summary>
              <Summary label="Receipt" onEdit={receipt ? undefined : () => goTo(steps.findIndex((s) => s.key === "supplier"))}>
                {receipt ? (
                  <>
                    Add to <span className="font-mono">{receipt.receivingNo}</span> · {receipt.supplierName} · {receipt.dateReceived}
                  </>
                ) : (
                  <>
                    New REC-{d.dateReceived.slice(0, 4)}-### · {supplier?.name} ({supplierTypeLabel(d.supplierType)}) · {d.dateReceived}
                  </>
                )}
              </Summary>
              {!receipt && (
                <Summary label="Delivery" onEdit={() => goTo(steps.findIndex((s) => s.key === "delivery"))}>
                  Truck inspected: {d.carrierInspection === "yes" ? "Yes" : "No"} · PO/invoice: {d.poInvoiceNo || "—"} · Tracking:{" "}
                  {d.trackingNo || "—"}
                </Summary>
              )}
              <Summary label="Batch" onEdit={() => goTo(steps.findIndex((s) => s.key === "batch"))}>
                {[d.supplierBatchNo && `Batch ${d.supplierBatchNo}`, d.lotNo && `Lot ${d.lotNo}`].filter(Boolean).join(" · ")}
                {(d.mfgDate || d.expDate) && ` · mfg ${d.mfgDate || "—"} / exp ${d.expDate || "—"}`}
              </Summary>
              <Summary label="Quantity" onEdit={() => goTo(steps.findIndex((s) => s.key === "batch"))}>
                {cases?.toLocaleString()} cases × {unitsPerCase?.toLocaleString()} = <strong>{qtyReceived?.toLocaleString()} units</strong>
                {d.overrideQty && ` (counted; reason: ${d.qtyOverrideReason})`}
                {!receipt && ` · matches packing list: ${d.qtyMatches === "yes" ? "yes" : `no — ${d.qtyMatchNote}`}`}
                {d.unitCost && ` · $${d.unitCost}/unit`}
              </Summary>
              <Summary label="Storage" onEdit={() => goTo(steps.findIndex((s) => s.key === "storage"))}>
                {location?.name}
                {!receipt && ` · segregation: ${segregationLabel(d.segregation)} · quarantine sticker: ${d.quarantineSticker ? "yes" : "no"}`}
              </Summary>
              <Summary label="Files" onEdit={() => goTo(steps.findIndex((s) => s.key === "storage"))}>
                {Object.entries(files)
                  .filter(([, name]) => name)
                  .map(([, name]) => name)
                  .join(", ") || "None"}
              </Summary>
            </dl>

            <RequirementList
              title="Must be done before saving"
              tone="red"
              rows={blocking}
              onGo={(r) => goTo(steps.findIndex((s) => s.key === stepForRequirement(r.req)))}
            />
            <RequirementList
              title="Can be added later — these block release"
              tone="amber"
              rows={later}
              onGo={(r) => (r.req.source === "inspection" ? undefined : goTo(steps.findIndex((s) => s.key === stepForRequirement(r.req))))}
            />
            {blocking.length === 0 && (
              <p className="text-sm text-slate-600">
                Saving creates the receiving record{receipt ? "" : " and REC number"}, the lot in <Badge tone="amber">Quarantine</Badge> and the
                receive transaction of {qtyReceived?.toLocaleString()} units.
              </p>
            )}
            <FormMessage state={state} />
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-4">
          <button type="button" className={secondaryButtonClass} onClick={() => goTo(stepIdx - 1)} disabled={stepIdx === 0}>
            ← Back
          </button>
          {/* Distinct keys: reusing one DOM button would turn the "Continue" click into a submit. */}
          {step.key === "review" ? (
            <button key="save" className={buttonClass} disabled={pending || blocking.length > 0}>
              {pending ? "Saving…" : "Save receipt — lot goes to Quarantine"}
            </button>
          ) : (
            <button key="next" type="button" className={buttonClass} onClick={next}>
              Continue →
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Choice({
  name,
  value,
  checked,
  onChange,
  title,
  subtitle,
}: {
  name: string;
  value: string | number;
  checked: boolean;
  onChange: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <label
      className={`block cursor-pointer rounded-lg border-2 p-3 transition ${
        checked ? "border-sky-600 bg-sky-50" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      <div className="font-medium">{title}</div>
      {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
    </label>
  );
}

function Pill({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string | number;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`cursor-pointer rounded-full border-2 px-4 py-1.5 text-sm font-medium ${
        checked ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 text-slate-700 hover:border-slate-400"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-2 text-sm text-red-600">{msg}</p> : null;
}

function Summary({ label, onEdit, children }: { label: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-slate-500">
        {label}
        {onEdit && (
          <button type="button" onClick={onEdit} className="text-xs text-sky-700 hover:underline">
            Edit
          </button>
        )}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function RequirementList({
  title,
  tone,
  rows,
  onGo,
}: {
  title: string;
  tone: "red" | "amber";
  rows: CheckResult[];
  onGo: (r: CheckResult) => void;
}) {
  if (!rows.length) return null;
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${cls}`}>
      <p className="mb-1 font-medium">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.req.key} className="flex flex-wrap items-center gap-2">
            <span>• {r.req.label}</span>
            {r.req.ref && <span className="rounded bg-white/70 px-1.5 font-mono text-xs">{r.req.ref}</span>}
            {r.req.source !== "inspection" && (
              <button type="button" onClick={() => onGo(r)} className="text-xs font-medium text-sky-700 underline">
                Go fix
              </button>
            )}
            {r.req.source === "inspection" && <span className="text-xs opacity-75">QC does this after receiving</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
