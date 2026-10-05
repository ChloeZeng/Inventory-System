-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "qcAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "tourCompletedAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("active", "createdAt", "id", "initials", "name", "role") SELECT "active", "createdAt", "id", "initials", "name", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_initials_key" ON "User"("initials");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Data: the warehouse role is removed; QC authority becomes a per-user flag.
-- Former "qc" users keep their authority. Both changes go to the audit trail
-- (userId NULL = system; `at` is epoch milliseconds, as Prisma stores DateTime in SQLite).
INSERT INTO "AuditLog" ("userId", "at", "action", "tableName", "recordId", "field", "oldValue", "newValue", "reason")
SELECT NULL, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 'update', 'User', CAST("id" AS TEXT), 'qcAuthorized', 'false', 'true',
       'Migration: role "qc" replaced by the QC authorized flag'
FROM "User" WHERE "role" = 'qc';
UPDATE "User" SET "qcAuthorized" = true WHERE "role" = 'qc';

INSERT INTO "AuditLog" ("userId", "at", "action", "tableName", "recordId", "field", "oldValue", "newValue", "reason")
SELECT NULL, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 'update', 'User', CAST("id" AS TEXT), 'role', "role", 'user',
       'Migration: warehouse and qc roles removed — all users can use every screen'
FROM "User" WHERE "role" IN ('warehouse', 'qc');
UPDATE "User" SET "role" = 'user' WHERE "role" IN ('warehouse', 'qc');
