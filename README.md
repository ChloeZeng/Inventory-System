# SVLSG Inventory System (prototype)

Guided receiving → quarantine → inspection (F.WD.003) → release → use, for a 21 CFR 111 supplement manufacturer.
Spec: [SVLSG-Inventory-Spec.md](SVLSG-Inventory-Spec.md).

Stack: Next.js 16 (App Router, TypeScript) · Prisma 6 + SQLite · Tailwind CSS 4.

## Run it

Requires **Node 20.9+** (`.nvmrc` pins 22).

```bash
nvm use            # switches to Node 22
npm install
npm run setup      # creates .env, builds prisma/dev.db, loads seed data
npm run dev        # http://localhost:3000
```

Then pick a demo user in the top-right corner (Warehouse / QC / Admin).

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app with hot reload |
| `npm run db:seed` | Re-run seed data (safe to repeat) |
| `npm run db:reset` | **Wipe** the local database and re-seed |
| `npm run db:migrate` | After editing `prisma/schema.prisma`: create and apply a migration |
| `npm run db:studio` | Browse the database in a web UI |

## Layout

```
prisma/schema.prisma   data model (spec §2)
prisma/seed.ts         users, locations, rooms, categories + Lids config, suppliers, ANSI Z1.4 tables
src/lib/               prisma client, numbering (item codes, REC-YYYY-###), audit log, uploads, category config
src/app/items/         items list / new / detail
src/app/suppliers/     suppliers list / new / detail
uploads/               uploaded files (git-ignored)
```

## Build progress

- [x] 1. Project setup, Prisma schema, seed data
- [x] 2. Items and suppliers pages
- [ ] 3. Receiving wizard + REC numbering + item code numbering
- [ ] 4. Lot detail + completeness engine + dashboard
- [ ] 5. Inspection wizard with auto sampling plan
- [ ] 6. Release rules + usage entry + calculated balance and cost
- [ ] 7. AuditLog on every create/update
- [ ] 8. Export

The ANSI Z1.4 tables in `prisma/seed.ts` must be checked by QA against the printed standard before use.
