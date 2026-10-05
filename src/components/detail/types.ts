// Serializable descriptions the server hands to the detail-page client components.

export type FixInput = {
  field: string;
  label: string;
  input: "text" | "decimal" | "date" | "select";
  value: string;
  options?: { value: string; label: string }[];
  hint?: string;
};

// The one small form a "Fix" button opens for a single requirement.
export type FixSpec =
  | { kind: "fields"; inputs: FixInput[]; correcting: boolean } // correcting: a wrong value is recorded → reason needed
  | { kind: "confirm"; field: string; statement: string } // a yes/no that must be Yes
  | { kind: "answer"; field: string; noteField: string; question: string; value: "" | "yes" | "no"; note: string }
  | { kind: "upload"; target: "lot" | "item"; types: string[]; note?: string }
  | { kind: "resolve"; question: string; note: string } // QC sign-off on a follow-up
  | { kind: "tab"; tab: string; label: string } // handled on another tab (e.g. inspection)
  | { kind: "link"; href: string; label: string; message: string }; // handled on another page

export type OpenItem = {
  key: string;
  label: string;
  ref?: string;
  status: "missing" | "followup";
  detail?: string;
  fix: FixSpec;
};

// The "What's next" card's buttons.
export type NextActionButton =
  | { kind: "fix"; key: string; label: string } // opens the Fix modal for one requirement
  | { kind: "tab"; tab: string; label: string } // switches to a tab
  | { kind: "do"; name: string; label: string; qcOnly?: boolean }; // opens an action modal (release, reject…)

export type DoneItem = { key: string; label: string; ref?: string; detail?: string; status: "done" | "na" };

export type RequirementGroup = {
  stage: string;
  title: string;
  met: number;
  total: number;
  open: OpenItem[];
  done: DoneItem[];
};
