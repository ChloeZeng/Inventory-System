"use client";

import { startTransition, useActionState } from "react";
import { SEGREGATION } from "@/lib/constants";
import type { ActionState } from "@/lib/forms";
import { Field, FormMessage, buttonClass, inputClass } from "@/components/ui";

export type LotDetailsInitial = {
  receivingNo: string;
  lotsOnReceipt: number;
  poInvoiceNo: string;
  trackingNo: string;
  carrierInspectionDone: boolean;
  qtyMatchesPackingList: boolean | null;
  qtyMatchNote: string;
  segregation: string;
  quarantineStickerApplied: boolean;
  supplierBatchNo: string;
  lotNo: string;
  mfgDate: string;
  expDate: string;
  unitCost: string;
  locationId: number;
};

// Every input sits in a wrapper with id="field-<name>" so checklist "Fix" links land on it.
export function LotDetailsForm({
  action,
  initial,
  locations,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: LotDetailsInitial;
  locations: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  const shared = initial.lotsOnReceipt > 1 ? ` — shared by all ${initial.lotsOnReceipt} lots on ${initial.receivingNo}` : "";

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        // Dispatch manually so a rejected save keeps what the user typed (a form action would reset it).
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold text-slate-700">This lot</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div id="field-supplierBatchNo" className="field-target">
            <Field label="Supplier batch no." htmlFor="supplierBatchNo" error={fe.supplierBatchNo}>
              <input id="supplierBatchNo" name="supplierBatchNo" className={inputClass} defaultValue={initial.supplierBatchNo} />
            </Field>
          </div>
          <div id="field-lotNo" className="field-target">
            <Field label="Lot no." htmlFor="lotNo">
              <input id="lotNo" name="lotNo" className={inputClass} defaultValue={initial.lotNo} />
            </Field>
          </div>
          <div id="field-mfgDate" className="field-target">
            <Field label="Mfg date" htmlFor="mfgDate">
              <input id="mfgDate" name="mfgDate" type="date" className={inputClass} defaultValue={initial.mfgDate} />
            </Field>
          </div>
          <div id="field-expDate" className="field-target">
            <Field label="Exp date" htmlFor="expDate" error={fe.expDate}>
              <input id="expDate" name="expDate" type="date" className={inputClass} defaultValue={initial.expDate} />
            </Field>
          </div>
          <div id="field-unitCost" className="field-target">
            <Field label="Unit cost (per unit, $)" htmlFor="unitCost" error={fe.unitCost}>
              <input id="unitCost" name="unitCost" inputMode="decimal" className={inputClass} defaultValue={initial.unitCost} placeholder="0.0125" />
            </Field>
          </div>
          <div id="field-locationId" className="field-target">
            <Field label="Location" htmlFor="locationId" error={fe.locationId}>
              <select id="locationId" name="locationId" className={inputClass} defaultValue={initial.locationId}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          The delivery <span className="font-mono">{initial.receivingNo}</span>
          <span className="font-normal text-slate-500">{shared}</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div id="field-poInvoiceNo" className="field-target">
            <Field label="PO / invoice no." htmlFor="poInvoiceNo">
              <input id="poInvoiceNo" name="poInvoiceNo" className={inputClass} defaultValue={initial.poInvoiceNo} />
            </Field>
          </div>
          <div id="field-trackingNo" className="field-target">
            <Field label="Tracking no." htmlFor="trackingNo">
              <input id="trackingNo" name="trackingNo" className={inputClass} defaultValue={initial.trackingNo} />
            </Field>
          </div>
          <div id="field-qtyMatchesPackingList" className="field-target">
            <Field label="Total matches packing list / PO?" htmlFor="qtyMatchesPackingList">
              <select
                id="qtyMatchesPackingList"
                name="qtyMatchesPackingList"
                className={inputClass}
                defaultValue={initial.qtyMatchesPackingList === null ? "" : initial.qtyMatchesPackingList ? "yes" : "no"}
              >
                <option value="">Not answered</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          </div>
          <div id="field-qtyMatchNote" className="field-target">
            <Field label="Difference / shortage note" htmlFor="qtyMatchNote" error={fe.qtyMatchNote}>
              <input id="qtyMatchNote" name="qtyMatchNote" className={inputClass} defaultValue={initial.qtyMatchNote} />
            </Field>
          </div>
          <div id="field-segregation" className="field-target">
            <Field label="Special segregation" htmlFor="segregation" error={fe.segregation}>
              <select id="segregation" name="segregation" className={inputClass} defaultValue={initial.segregation}>
                {SEGREGATION.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <div id="field-carrierInspectionDone" className="field-target">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="carrierInspectionDone" defaultChecked={initial.carrierInspectionDone} /> Truck inspection done (F.WD.001)
          </label>
        </div>
        <div id="field-quarantineStickerApplied" className="field-target">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="quarantineStickerApplied" defaultChecked={initial.quarantineStickerApplied} /> Quarantine sticker on every box
          </label>
        </div>
      </fieldset>

      <Field label="Reason for change" htmlFor="reason" error={fe.reason} hint="Needed only when correcting a value that was already recorded. Saved in the audit trail.">
        <input id="reason" name="reason" className={inputClass} />
      </Field>

      <FormMessage state={state} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
