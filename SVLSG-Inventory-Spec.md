# SVLSG Inventory System — Prototype Spec (v0.1, Lids module)

Guided, TurboTax-style intake and inventory system for a dietary supplement manufacturer (21 CFR 111).
Goal of this prototype: prove the flow **Receive → Quarantine → Inspect (F.WD.003) → Release/Reject → Use** for **Lids**, with a missing-info checklist and per-lot cost.
The data model must also fit Raw Ingredients and other components later — do not hard-code Lids-only logic.

---

## 1. Tech stack (prototype)

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (React + TypeScript) | One project for UI and server logic |
| Database | SQLite via Prisma | Runs locally, no setup; switch to Postgres later without rewriting |
| Styling | Tailwind CSS | Fast, clean forms |
| Files | Local `/uploads` folder | Later: cloud storage |
| Login | Simple user picker for demo | Later: Google Workspace login |

Run locally in VS Code with `npm run dev`.

---

## 2. Data model

**User** — name, initials, role (`warehouse`, `qc`, `admin`)

**Location** — `1283 Alviso`, `1241 Alderwood`
**Room** — name (e.g. `#6 Packaging`, `#12`), location

**Category** — name, code prefix, parent, test path
- Seed: `Raw Ingredients (R)`, `Components-Capsules (C-CAP)`, `Components-Bottles (C-BOT)`, `Components-Lids (C-LID)`, `Components-Labels (C-LABEL)`, `Internal-Components-SilicaPackets (INT-C-SP)`
- Test path for Lids: `ansi_sampling` (F.WD.003)

**Supplier** — name, type (`SVLSG supplier` / `customer-supplied`), ASL approved (yes/no), contact
- Receiving from a non-approved supplier shows a warning.

**Item** (one per item type, NOT per batch) — item code (auto: prefix + next number), name, category, spec fields (Lids: size, color, material/type), spec sheet file
- A new item code is created only for a new item type, never for a new batch.

**Receipt** (one delivery) — receiving no. (auto `REC-YYYY-###`), date received, supplier, PO/invoice no., tracking no., carrier inspection F.WD.001 done (yes/no), special segregation (organic / allergen / refrigeration / none), received or rejected at dock, received by (initials)
- One receipt can contain several lots.

**Lot** (one batch of one item) — item, receipt, supplier batch no., lot no., mfg date, exp date (if any), number of cases, units per case, qty received (auto = cases × units per case, editable with reason), unit cost, location, QC status (`Quarantine` → `Released` / `Rejected`), box label photo, operator

**Document** — lot or receipt, type (`COA`, `Packing list`, `Invoice`, `Spec sheet`, `Photo`, `F.WD.001`, `Other`), file, uploaded by, date

**Inspection** (F.WD.003) — lot, inspection level, AQL, lot size, code letter, sample size, cases sampled, items sampled, accept/reject numbers, checklist answers (see 4.3), defects found, comments, disposition, inspected by, date

**InventoryTransaction** — lot, type (`receive`, `production use`, `sample`, `sent to client`, `damaged/defect`, `adjustment`), qty, room, product/customer, date, operator, notes
- **Balance is always calculated** from transactions, never typed.
- Only one date per transaction.
- Only `Released` lots can be used in production.

**AuditLog** — who, when, table, record, field, old value, new value, reason. Append-only. Build from day one.

---

## 3. Completeness engine ("what's missing")

Each category has a config listing required fields/documents per stage:
- `at_receiving` — must be filled to save the receipt
- `before_release` — can be added later; blocks release until complete

Every lot shows a progress bar and a list like: *"Missing before release: Invoice no., Spec sheet, F.WD.003 inspection."*
A dashboard lists all lots with missing items, filterable by category and status.

Keep the config as data (JSON or table), not scattered `if` statements, so Raw Ingredients can add its own rules later.

---

## 4. Lids — question flow

### 4.1 Receiving wizard (warehouse)

| # | Question | Input | Stage | Notes |
|---|---|---|---|---|
| 1 | What are you receiving? | Category picker | receiving | Lids |
| 2 | Is this an item we already have? | Search existing items / "New item" | receiving | Show code, size, color |
| 2a | (New item) Size? Color? Material? | Text / pickers | receiving | Auto-assigns C-LID-### |
| 2b | (New item) Spec sheet | Upload | before release | |
| 3 | Who is the supplier? | Pick from supplier list | receiving | Warn if not ASL approved |
| 3a | SVLSG supplier or customer-supplied? | Auto from supplier, editable | receiving | |
| 4 | Date received | Date (default today) | receiving | |
| 5 | Was the truck inspected (F.WD.001)? | Yes/No + upload | receiving | |
| 6 | PO / invoice no. | Text | before release | |
| 7 | Tracking no. | Text | optional | |
| 8 | Supplier batch no. / lot no. | Text | receiving | At least one required |
| 9 | Mfg date / exp date | Date | optional for Lids | |
| 10 | How many cases? How many units per case? | Numbers | receiving | Auto total |
| 11 | Does the total match the packing list/PO? | Yes/No + note | receiving | Shortages go in notes |
| 12 | Unit cost | Currency | before release | Per unit |
| 13 | Any special segregation needed? | Organic / allergen / refrigeration / none | receiving | |
| 14 | Which location? | 1283 Alviso / 1241 Alderwood | receiving | |
| 15 | Photo of box label | Upload | receiving | |
| 16 | Packing list / COA | Upload | before release | |
| 17 | Quarantine sticker applied on every box? | Checkbox | receiving | |
| — | Review screen | Summary + missing list | — | Creates Receipt, Lot, receive transaction, REC no. |

### 4.2 Sampling plan (auto-calculated)

- Lot size = **total units received** (e.g. 106,080 lids, not 104 cases).
- Inspection level: **General II**.
- AQL by defect class: **Critical 0.25, Major 2.5, Minor 4.0**.
- Look up code letter (Table 1) → sample size and Ac/Re per defect class (Table 2-A). Store tables as seed data; QA must verify against the printed standard before use.
- Because of the arrows, each defect class can end up with a different sample size. Show the plan per class. Example, lot 106,080 → code N:
  - Critical 0.25: sample 500, Ac 3 / Re 4
  - Major 2.5: sample 500, Ac 21 / Re 22
  - Minor 4.0: arrow up → use M plan, sample 315, Ac 21 / Re 22
  - Draw the largest sample (500); count minor defects in the first 315 (to confirm with QA).

Table 1, General Level II:
| Lot size | Code |
|---|---|
| 2–8 | A |
| 9–15 | B |
| 16–25 | C |
| 26–50 | D |
| 51–90 | E |
| 91–150 | F |
| 151–280 | G |
| 281–500 | H |
| 501–1,200 | J |
| 1,201–3,200 | K |
| 3,201–10,000 | L |
| 10,001–35,000 | M |
| 35,001–150,000 | N |
| 150,001–500,000 | P |
| 500,001+ | Q |

Sample sizes: A 2, B 3, C 5, D 8, E 13, F 20, G 32, H 50, J 80, K 125, L 200, M 315, N 500, P 800, Q 1250, R 2000.
Arrows in Table 2-A mean "use the plan above/below", which can change the sample size — implement that rule, and if sample size ≥ lot size, inspect 100%.

### 4.3 Inspection wizard (QC) — F.WD.003

Header auto-filled: component type, part # (item code), PO, receiving #, supplier, date received, qty received, batch no., sample size.
QC enters: cases sampled, total items sampled.

Checklist (Yes / No / N/A each):
- Form: same material? color matches standard? artwork matches standard? artwork complete and legible? packaging matches QC standard?
- Fit: same size as standard? closure and container fit?
- Function: closure can be applied and removed? container mechanism works? label adhesive sufficient / releases cleanly? tape test passed? rub-off test passed?

Then: defects found, counted by class (critical / major / minor), comments, inspected by, date.

Disposition is calculated from the AQL plan:
- If any class's defect count ≥ its Re number → **Rejected**
- If every class is ≤ its Ac number → **Approved**
- Any "No" answer must be recorded as a defect with a class.
- QC can override the calculated result only with a written reason (logged in AuditLog).

### 4.4 Release
- Only `qc` role can change status.
- Release is blocked while any `before_release` item is missing.
- On release, prompt: "Release sticker placed over quarantine sticker?" (checkbox).
- Status change is written to AuditLog with re-entered password (demo: confirmation dialog).

### 4.5 Usage entry (warehouse)
Lot (released only) → type → qty → room → product/customer → date → notes. Shows new balance and cost of qty used (qty × unit cost).

---

## 5. Screens

1. Dashboard — lots in quarantine, lots with missing info, low balances
2. Receive (wizard 4.1)
3. Lot detail — info, documents, inspection, transactions, balance, cost, audit history
4. Inspect (wizard 4.3)
5. Record usage (4.5)
6. Items & suppliers lists
7. Export — per lot or per date range: receiving log, inventory card, F.WD.003, audit trail (Excel/PDF)

---

## 6. Build order for Claude Code

1. Project setup, Prisma schema, seed data (categories, locations, rooms, users, sample suppliers, ANSI tables)
2. Items and suppliers pages
3. Receiving wizard + REC numbering + item code numbering
4. Lot detail + completeness engine + dashboard
5. Inspection wizard with auto sampling plan
6. Release rules + usage entry + calculated balance and cost
7. AuditLog on every create/update
8. Export

Test with real data from the current sheet: C-Lids-010-38mm, batch MDLSM2605131-01, received 2026-07-30, 104 cases × 1,020 = 106,080, supplier HongKong Tao Nutrition Health Science Company, location 1241 Alderwood.

---

## 7. Open questions (confirm with QA)

1. Item code: does the size suffix (e.g. `-38mm`) belong in the code, or only in the item name?
2. When defect classes need different sample sizes, is "draw the largest sample, count minor in the first 315" acceptable?
3. Unit cost from PO or invoice? Include shipping?
4. Full list of usage types (production, sample, sent to client, damaged, other?).
5. Lids: are mfg/exp dates required?

Resolved:
- AQL: Critical 0.25 / Major 2.5 / Minor 4.0, General Level II; release decided by AQL Ac/Re, not "zero defects".
- Sampling lot size = total units received.
