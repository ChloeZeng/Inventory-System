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
npm run dev        # http://localhost:3000
```

The first visit opens a short welcome: pick who you are (demo users: Warehouse Demo, QC Demo, Admin Demo), see what you can do, then take the 3-step tour of Home. Switch users or reopen the tour from the bottom of the sidebar.

### Users and QC authorization

- Everyone can use every screen: Receive, Record usage, Inspect and Release.
- **QC authorized** (a per-user flag) is needed to set an inspection disposition, release or reject a lot, resolve QC follow-ups (e.g. a quantity difference) and change ASL approval. Others see those buttons disabled with "Requires QC authorization"; the server checks too.
- **Admin** manages users: on the Users page an admin grants or removes QC authorization, with a reason that is saved in the audit trail.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app with hot reload |
| `npm test` | Unit tests (node:test via tsx): workflow selector, inspection rules |
| `npm run db:refresh-workflow` | Recompute every lot's workflow cache (run after changing category requirements) |
| `npm run db:seed` | Re-run seed data (safe to repeat) |
| `npm run db:reset` | **Wipe** the local database and re-seed |
| `npm run db:migrate` | After editing `prisma/schema.prisma`: create and apply a migration |
| `npm run db:studio` | Browse the database in a web UI |

## Layout

```
prisma/schema.prisma   data model (spec §2)
prisma/seed.ts         users, locations, rooms, categories + Lids config, suppliers, ANSI Z1.4 tables
src/lib/               prisma client, numbering (item codes, REC-YYYY-###), audit log + readable formatting,
                       uploads, category config, completeness engine, lot progress, ANSI sampling plan, to-dos
src/components/detail/ detail-page kit (sticky header, what's next card, requirements panel with one-field Fix modals,
                       tabs; ?tab= / ?fix=<requirement> / ?do=<action> deep links) — lots use it; items and suppliers can follow
src/lib/workflow.ts    the one workflow selector: stage, queues, current task, who can act; + the Lot.wf* cache
src/lib/work-queries.ts database queries for queues and the Lots list (counts, filters, pagination)
src/lib/inspection.ts  F.WD.003 draft / confirm rules
src/lib/lot-fixes.ts   lot requirements → Fix forms and the "What's next" sentence and button
src/lib/navigation.ts  sidebar groups — add a module (Raw materials, Production, Export…) here
src/proxy.ts           first visit (no user chosen yet) → /welcome
src/app/welcome/       onboarding: welcome, "Who are you?", what you can do
src/app/(app)/         everything with the sidebar (layout.tsx):
  page.tsx             Home "My work": queues (inspection / release review / receiving & documents), ≤10 entries, for-you filter
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

After pulling changes run `npm run db:migrate` then `npm run db:seed`. The migrations convert old roles: former "qc" users become QC authorized, warehouse/qc roles become "user", and both changes are written to the audit trail.

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

The ANSI Z1.4 tables in `prisma/seed.ts` must be checked by QA against the printed standard before use.
