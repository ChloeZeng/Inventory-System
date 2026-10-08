-- Inspection drafts (status), QC confirmation, usage idempotency key, and the lot workflow cache.
-- Existing inspections were recorded results, so they become "final".
-- The wf* cache columns start at defaults; `npm run db:refresh-workflow` (also run by the seed) fills them.

-- AlterTable
ALTER TABLE "InventoryTransaction" ADD COLUMN "clientRequestId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Inspection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'final',
    "inspectionLevel" TEXT NOT NULL DEFAULT 'II',
    "lotSize" INTEGER NOT NULL,
    "codeLetter" TEXT,
    "plan" TEXT NOT NULL DEFAULT '[]',
    "sampleSize" INTEGER,
    "casesSampled" INTEGER,
    "itemsSampled" INTEGER,
    "checklist" TEXT NOT NULL DEFAULT '{}',
    "criticalDefects" INTEGER NOT NULL DEFAULT 0,
    "majorDefects" INTEGER NOT NULL DEFAULT 0,
    "minorDefects" INTEGER NOT NULL DEFAULT 0,
    "defectNotes" TEXT,
    "comments" TEXT,
    "calculatedDisposition" TEXT,
    "disposition" TEXT,
    "overrideReason" TEXT,
    "inspectedById" INTEGER NOT NULL,
    "inspectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" INTEGER,
    "confirmedAt" DATETIME,
    CONSTRAINT "Inspection_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Inspection_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Inspection_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Inspection" ("calculatedDisposition", "casesSampled", "checklist", "codeLetter", "comments", "criticalDefects", "defectNotes", "disposition", "id", "inspectedAt", "inspectedById", "inspectionLevel", "itemsSampled", "lotId", "lotSize", "majorDefects", "minorDefects", "overrideReason", "plan", "sampleSize") SELECT "calculatedDisposition", "casesSampled", "checklist", "codeLetter", "comments", "criticalDefects", "defectNotes", "disposition", "id", "inspectedAt", "inspectedById", "inspectionLevel", "itemsSampled", "lotId", "lotSize", "majorDefects", "minorDefects", "overrideReason", "plan", "sampleSize" FROM "Inspection";
DROP TABLE "Inspection";
ALTER TABLE "new_Inspection" RENAME TO "Inspection";
CREATE INDEX "Inspection_lotId_status_idx" ON "Inspection"("lotId", "status");
CREATE TABLE "new_Lot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemId" INTEGER NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "supplierBatchNo" TEXT,
    "lotNo" TEXT,
    "mfgDate" DATETIME,
    "expDate" DATETIME,
    "cases" INTEGER NOT NULL,
    "unitsPerCase" INTEGER NOT NULL,
    "qtyReceived" INTEGER NOT NULL,
    "qtyOverrideReason" TEXT,
    "unitCost" DECIMAL,
    "locationId" INTEGER NOT NULL,
    "qcStatus" TEXT NOT NULL DEFAULT 'Quarantine',
    "releaseStickerPlaced" BOOLEAN,
    "releasedAt" DATETIME,
    "releasedById" INTEGER,
    "rejectedAt" DATETIME,
    "rejectedById" INTEGER,
    "rejectionReason" TEXT,
    "operatorId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wfStage" TEXT NOT NULL DEFAULT 'receiving',
    "wfInspection" BOOLEAN NOT NULL DEFAULT false,
    "wfInspectionDraft" BOOLEAN NOT NULL DEFAULT false,
    "wfRelease" BOOLEAN NOT NULL DEFAULT false,
    "wfReleaseBlocked" BOOLEAN NOT NULL DEFAULT false,
    "wfFollowup" BOOLEAN NOT NULL DEFAULT false,
    "wfFollowupQcOnly" BOOLEAN NOT NULL DEFAULT false,
    "wfOpenTasks" INTEGER NOT NULL DEFAULT 0,
    "wfBalance" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Lot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Lot" ("cases", "createdAt", "expDate", "id", "itemId", "locationId", "lotNo", "mfgDate", "operatorId", "qcStatus", "qtyOverrideReason", "qtyReceived", "receiptId", "rejectedAt", "rejectedById", "rejectionReason", "releaseStickerPlaced", "releasedAt", "releasedById", "supplierBatchNo", "unitCost", "unitsPerCase") SELECT "cases", "createdAt", "expDate", "id", "itemId", "locationId", "lotNo", "mfgDate", "operatorId", "qcStatus", "qtyOverrideReason", "qtyReceived", "receiptId", "rejectedAt", "rejectedById", "rejectionReason", "releaseStickerPlaced", "releasedAt", "releasedById", "supplierBatchNo", "unitCost", "unitsPerCase" FROM "Lot";
DROP TABLE "Lot";
ALTER TABLE "new_Lot" RENAME TO "Lot";
CREATE INDEX "Lot_qcStatus_idx" ON "Lot"("qcStatus");
CREATE INDEX "Lot_wfInspection_idx" ON "Lot"("wfInspection");
CREATE INDEX "Lot_wfRelease_idx" ON "Lot"("wfRelease");
CREATE INDEX "Lot_wfFollowup_idx" ON "Lot"("wfFollowup");
CREATE INDEX "Lot_wfStage_idx" ON "Lot"("wfStage");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_clientRequestId_key" ON "InventoryTransaction"("clientRequestId");

