-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER,
    "receiptId" INTEGER,
    "itemId" INTEGER,
    "supplierId" INTEGER,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" INTEGER NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("fileName", "id", "itemId", "lotId", "mimeType", "receiptId", "sizeBytes", "storagePath", "type", "uploadedAt", "uploadedById") SELECT "fileName", "id", "itemId", "lotId", "mimeType", "receiptId", "sizeBytes", "storagePath", "type", "uploadedAt", "uploadedById" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
