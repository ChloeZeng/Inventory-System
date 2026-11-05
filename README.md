# SVLSG Inventory System (prototype)

Guided receiving → quarantine → inspection (F.WD.003) → release → use, for a 21 CFR 111 supplement manufacturer.
Spec: [SVLSG-Inventory-Spec2.md](SVLSG-Inventory-Spec2.md) (v1: [SVLSG-Inventory-Spec.md](SVLSG-Inventory-Spec.md)).

Stack: Next.js 16 (App Router, TypeScript) · Prisma 6 + SQLite · Tailwind CSS 4.

## Run it

Requires **Node 20.9+** (`.nvmrc` pins 22).

```bash
nvm use            # switches to Node 22
npm install
npm run setup      # creates .env, builds prisma/dev.db, loads seed data
npm run seed:demo  # optional: CLEARS the local database and loads demo items and lots for every category
npm run dev        # http://localhost:3000
```

The first visit opens a short welcome: pick who you are (demo users: **QC** — QC authorized; **Admin 1**, **Admin 2**, **Admin 3** — not QC authorized), see what you can do, then take the 3-step tour of Home. Switch users or reopen the tour from the bottom of the sidebar.

### Demo data (`npm run seed:demo`)

For demos only. It deletes every row, then loads all ten categories with 2–3 items per category and per sub-type,
and lots in different states: awaiting inspection, inspection draft waiting for QC, ready for release, missing
documents (lab results, COA, packing list, spec sheet), a quantity difference for QC to resolve, released, and in
use. It also includes a loss (C-CB-001) and a lot near expiry (RM-001, expiring 25 days after the reset).
It includes two real examples: C-BOT-001 (150ml PET Amber, owned by LiQi, dedicated to EGUOO-Milk Thistle,
lot LQ401263093, 99,540 of 142,800 used in #6 Packaging) and C-LID-010 (38mm White PP, lot MDLSM2605131-01,
1241 Alderwood). Every other supplier, item and lot is demo data, and the documents are placeholder files marked DEMO.

The script **refuses to run** unless `DATABASE_URL` is a local SQLite file directly inside `prisma/` (not a
`postgres://` URL, not a file whose name contains "prod") and `NODE_ENV` is not `production`
(`src/lib/demo-guard.ts`). Never point it at production data.

### Categories

The ten inventory categories are data (`prisma/catalog.ts` seeds them into the `Category` table), shown with their
form number, e.g. "F.IV.004 · Lids". Each one stores its code prefix, sub-types, unit, test path and required
fields, so they can be edited later without code changes. Item codes are always uppercase `PREFIX-###`.

| Form | Category | Sub-types | Code | Unit | Testing before release |
|---|---|---|---|---|---|
| F.IV.001 | Raw Ingredients | — | RM-001 | kg | ID, microbiology, heavy metals |
| F.IV.002 | Capsules | Empty shell / Finished capsule | C-CAP-001 | pcs / capsules | COA + ANSI sampling / ID, microbiology, heavy metals |
| F.IV.003 | Bottles | — | C-BOT-001 | pcs | ANSI sampling |
| F.IV.004 | Lids | — | C-LID-001 | pcs | ANSI sampling |
| F.IV.005 | Labels | — | C-LBL-001 | pcs | ANSI sampling (items also have a label version) |
| F.IV.006 | Shipper Packs | — | C-SP-001 | pcs | ANSI sampling |
| F.IV.007 | Cardboards | — | C-CB-001 | pcs | ANSI sampling |
| F.IV.008 | Silica | Canister / Packet | IC-SGC-001 / IC-SGP-001 | pcs | COA + ANSI sampling |
| F.IV.009 | Scoops | — | IC-SCOOP-001 | pcs | ANSI sampling |
| F.IV.010 | Tablets | Purchased / In-house | C-TB-001 | tablets | ID, microbiology, heavy metals (purchased also needs the supplier COA) |

A new item in a category with sub-types first asks which one (e.g. "Canister or packet?"). A sub-type can have its
own code prefix, unit, test path and requirements (`itemSettings` in `src/lib/category-config.ts`). "In-house" tablets
are only a flag for now; in-house production will come from a future production module. Each category also stores
its default inventory columns (`inventoryColumns`; values from `src/lib/inventory-view.ts`).

### Stock

A lot's balance is always calculated from its transactions, never typed:
**received − used − loss − scrap ± count adjustment** (`src/lib/stock.ts`). Loss, scrap and count adjustment each
need a reason, stored on the transaction and in the audit trail (`applyStockChange` in `src/lib/stock-change.ts`,
server action `recordStockChange`; on the lot page: "Record loss or scrap", "Record stock count"). Item stock shows
**Available** (released lots only) and **Quarantine** separately; rejected lots count in neither. A complete item or
supplier record is marked "Record complete"; a lot's status is only Quarantine / Released / Rejected.

**Monthly count:** every released lot with stock is counted once a calendar month. A count is recorded as a count
adjustment — the difference found, or 0 when the count matches — so a lot is "Monthly count due" until it has one this
month.

### Navigation

- Sidebar: **Home**, **Inventory**, **Tasks**; **Settings** at the bottom (Item master data, Suppliers, Users,
  Categories). Lots are reached from Inventory ("All lots"), Tasks and Home.
- **Receive delivery** and **Record usage** are fixed at the top right of every page (in the top bar on a phone).
  Record usage first asks which released lot (the ones expiring first at the top).
- **Home** is an overview: stock by category (items, available with unit, lots in quarantine; "View all" opens
  Inventory filtered to the category), task counts with the three most urgent, and the 10 latest activities.
- **Inventory**: category tabs, "By item" / "By lot", each category's default columns plus a column picker and
  filters (stock, status, expiry, location, owner) — remembered per user, per view and tab. Available shows
  "Released · Quarantine" chips. "Export Excel" / "Export CSV" export exactly the current view (all pages).
  A warning sign next to an item code means its record is incomplete (hover for what is missing).
- **Item page**: code, name, owner / dedicated product, Available with chips and locations at the top; "Edit" opens
  the form in a modal; "Record complete" badge or the list of what is missing; tabs Lots (columns selectable,
  remembered) | Usage | Documents | Details | Audit history.
- **Tasks** holds the work lists, grouped by type (inspection, release review, receiving & documents, missing
  documents, monthly count, item and supplier records), with search, category, type and for-you / all filters.

Items have a **description** (size, material, color), an **owner** (SVLSG or a client), an optional **dedicated
product** and a **usual supplier** (separate from the owner). Recording production use of an item for a product other
than its dedicated product shows a warning and needs a reason, which is saved in the audit trail.

### Users and QC authorization

- Everyone can use every screen: Receive, Record usage, Inspect and Release.
- **QC authorized** (a per-user flag) is needed to set an inspection disposition, release or reject a lot, resolve QC follow-ups (e.g. a quantity difference) and change ASL approval. Others see those buttons disabled with "Requires QC authorization"; the server checks too.
- **Admin** manages users: on the Users page an admin grants or removes QC authorization, with a reason that is saved in the audit trail.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app with hot reload |
| `npm test` | Unit tests (node:test via tsx): workflow selector, inspection rules, demo guard, wording |
| `npm run db:refresh-workflow` | Recompute every lot's workflow cache (run after changing category requirements) |
| `npm run db:seed` | Re-run seed data (safe to repeat; never deletes) |
| `npm run seed:demo` | **Demo only:** clear the local database and load demo data (refuses anything but a local SQLite file in `prisma/`) |
| `npm run db:reset` | **Wipe** the local database and re-seed |
| `npm run db:migrate` | After editing `prisma/schema.prisma`: create and apply a migration |
| `npm run db:studio` | Browse the database in a web UI |

## Layout

```
prisma/schema.prisma   data model (spec §2)
prisma/catalog.ts      the ten categories (form no., prefix, sub-types, unit, test path, requirements), locations,
                       demo users, ANSI Z1.4 tables — shared by the seed and the demo reset
prisma/seed.ts         baseline seed (upserts only)
scripts/seed-demo.ts   demo reset (npm run seed:demo) — clears the database first, guarded
src/lib/               prisma client, numbering (item codes, REC-YYYY-###), audit log + readable formatting,
                       uploads, category config, completeness engine, lot progress, ANSI sampling plan, to-dos
src/components/detail/ detail-page kit (sticky header, what's next card, requirements panel with one-field Fix modals,
                       tabs; ?tab= / ?fix=<requirement> / ?do=<action> deep links) — lots use it; items and suppliers can follow
src/lib/workflow.ts    the one workflow selector: stage, queues, current task, who can act; + the Lot.wf* cache
src/lib/work-queries.ts database queries for queues and the Lots list (counts, filters, pagination)
src/lib/inspection.ts  F.WD.003 draft / confirm rules
src/lib/lot-fixes.ts   lot requirements → Fix forms and the "What's next" sentence and button
src/lib/navigation.ts  sidebar (main group + Settings) — add a module (Raw materials, Production, Export…) here
src/lib/overview.ts    Home / Tasks queries: stock by category, missing documents, monthly counts, recent activity
src/lib/inventory-view.ts Inventory list: columns, filters, rows by item / by lot, export table
src/lib/spreadsheet.ts CSV and .xlsx writer (no dependency)
src/lib/preferences.ts per-user view settings (UserPreference: columns, filters)
src/proxy.ts           first visit (no user chosen yet) → /welcome
src/app/welcome/       onboarding: welcome, "Who are you?", what you can do
src/app/(app)/         everything with the sidebar (layout.tsx):
  page.tsx             Home overview: stock by category, task counts + 3 most urgent, recent activity
  tasks/               Tasks: work lists grouped by type, with filters
  inventory/           Inventory: by item / by lot, category tabs, column picker, filters, CSV / Excel export
  usage/               "Record usage": pick a released lot
  settings/categories/ category settings (read-only)
  receive/             receiving wizard (spec §4.1)
  lots/                lots list (server-side filters + pagination) + lot detail (inspection F.WD.003, release, usage)
                       lot detail (top: identity, steps, what's next, open requirements; tabs: Details | Documents | Inspection | History)
  items/               items list / new / detail (with checklist)
  suppliers/           suppliers list / new / detail (with checklist and F.QC.009 / F.QC.015 documents)
  users/               users and QC authorization (admin)
public/logo.svg        company logo (sidebar, welcome screen; collapsed sidebar shows its left-hand mark)
uploads/               uploaded files (git-ignored)
```

## Build progress

- [x] 1. Project setup, Prisma schema, seed data
- [x] 2. Items and suppliers pages
- [x] 3. Receiving wizard + REC numbering + item code numbering
- [x] 4. Lot detail + completeness engine + dashboard (plus Home task hub, item/supplier checklists)
- [x] 5. Inspection entry (F.WD.003): drafts, QC confirmation, calculated suggestion from the sampling plan
- [x] 6. Release rules + usage entry + calculated balance and cost
- [ ] 7. AuditLog on every create/update
- [ ] 8. Export

After pulling changes run `npm run db:migrate` then `npm run db:seed`. The migrations convert old roles: former "qc" users become QC authorized, warehouse/qc roles become "user", and both changes are written to the audit trail. The seed updates existing categories in place (old prefixes R, C-LABEL and INT-C-SP become RM, C-LBL and Silica; existing item codes are kept) and deactivates the old demo users Warehouse Demo and Admin Demo (they may own history, so they are not deleted).

### Workflow cache

Lists and queues filter on cached columns on each lot (`wfStage`, `wfInspection`, `wfRelease`, …). They are derived
from the rules (completeness engine, confirmed inspections, ledger) and rewritten in the same transaction as every
change that affects them; `npm run db:refresh-workflow` rebuilds them. The rules themselves stay authoritative.

### Scale testing

Never against `dev.db` — the script refuses unless the database name contains "test":

```bash
export DATABASE_URL="file:./test-scale.db"
npx prisma migrate deploy && npx prisma db seed && npx tsx scripts/seed-synthetic.ts 1200
```

The ANSI Z1.4 tables in `prisma/catalog.ts` must be checked by QA against the printed standard before use.
