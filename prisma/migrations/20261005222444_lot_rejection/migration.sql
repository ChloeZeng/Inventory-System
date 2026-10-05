-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "Lot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Lot" ("cases", "createdAt", "expDate", "id", "itemId", "locationId", "lotNo", "mfgDate", "operatorId", "qcStatus", "qtyOverrideReason", "qtyReceived", "receiptId", "releaseStickerPlaced", "releasedAt", "releasedById", "supplierBatchNo", "unitCost", "unitsPerCase") SELECT "cases", "createdAt", "expDate", "id", "itemId", "locationId", "lotNo", "mfgDate", "operatorId", "qcStatus", "qtyOverrideReason", "qtyReceived", "receiptId", "releaseStickerPlaced", "releasedAt", "releasedById", "supplierBatchNo", "unitCost", "unitsPerCase" FROM "Lot";
DROP TABLE "Lot";
ALTER TABLE "new_Lot" RENAME TO "Lot";
CREATE INDEX "Lot_qcStatus_idx" ON "Lot"("qcStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
