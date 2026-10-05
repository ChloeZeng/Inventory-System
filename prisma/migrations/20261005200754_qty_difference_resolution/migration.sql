-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Receipt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "receivingNo" TEXT NOT NULL,
    "dateReceived" DATETIME NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "supplierType" TEXT NOT NULL,
    "poInvoiceNo" TEXT,
    "trackingNo" TEXT,
    "carrierInspectionDone" BOOLEAN NOT NULL DEFAULT false,
    "segregation" TEXT NOT NULL DEFAULT 'none',
    "dockStatus" TEXT NOT NULL DEFAULT 'received',
    "qtyMatchesPackingList" BOOLEAN,
    "qtyMatchNote" TEXT,
    "qtyDiffResolution" TEXT,
    "qtyDiffResolvedById" INTEGER,
    "qtyDiffResolvedAt" DATETIME,
    "quarantineStickerApplied" BOOLEAN NOT NULL DEFAULT false,
    "receivedById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Receipt_qtyDiffResolvedById_fkey" FOREIGN KEY ("qtyDiffResolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Receipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Receipt" ("carrierInspectionDone", "createdAt", "dateReceived", "dockStatus", "id", "poInvoiceNo", "qtyMatchNote", "qtyMatchesPackingList", "quarantineStickerApplied", "receivedById", "receivingNo", "segregation", "supplierId", "supplierType", "trackingNo") SELECT "carrierInspectionDone", "createdAt", "dateReceived", "dockStatus", "id", "poInvoiceNo", "qtyMatchNote", "qtyMatchesPackingList", "quarantineStickerApplied", "receivedById", "receivingNo", "segregation", "supplierId", "supplierType", "trackingNo" FROM "Receipt";
DROP TABLE "Receipt";
ALTER TABLE "new_Receipt" RENAME TO "Receipt";
CREATE UNIQUE INDEX "Receipt_receivingNo_key" ON "Receipt"("receivingNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
