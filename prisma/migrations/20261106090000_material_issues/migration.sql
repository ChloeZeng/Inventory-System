-- CreateTable
CREATE TABLE "MaterialIssue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "issueNo" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "client" TEXT,
    "batchNo" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" INTEGER,
    "confirmedAt" DATETIME,
    "confirmNote" TEXT,
    "cancelledById" INTEGER,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    CONSTRAINT "MaterialIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaterialIssue_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaterialIssue_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialIssueLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "issueId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "lotId" INTEGER NOT NULL,
    "plannedQty" INTEGER NOT NULL,
    "actualQty" INTEGER,
    "lossQty" INTEGER,
    "returnedQty" INTEGER,
    "productReason" TEXT,
    CONSTRAINT "MaterialIssueLine_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "MaterialIssue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaterialIssueLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaterialIssueLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT,
    "issueLineId" INTEGER,
    "roomId" INTEGER,
    "productOrCustomer" TEXT,
    "date" DATETIME NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "notes" TEXT,
    "clientRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_issueLineId_fkey" FOREIGN KEY ("issueLineId") REFERENCES "MaterialIssueLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventoryTransaction" ("clientRequestId", "createdAt", "date", "id", "lotId", "notes", "operatorId", "productOrCustomer", "qty", "reason", "roomId", "type") SELECT "clientRequestId", "createdAt", "date", "id", "lotId", "notes", "operatorId", "productOrCustomer", "qty", "reason", "roomId", "type" FROM "InventoryTransaction";
DROP TABLE "InventoryTransaction";
ALTER TABLE "new_InventoryTransaction" RENAME TO "InventoryTransaction";
CREATE UNIQUE INDEX "InventoryTransaction_clientRequestId_key" ON "InventoryTransaction"("clientRequestId");
CREATE INDEX "InventoryTransaction_lotId_idx" ON "InventoryTransaction"("lotId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_issueNo_key" ON "MaterialIssue"("issueNo");

-- CreateIndex
CREATE INDEX "MaterialIssue_status_idx" ON "MaterialIssue"("status");

-- CreateIndex
CREATE INDEX "MaterialIssueLine_lotId_idx" ON "MaterialIssueLine"("lotId");

-- CreateIndex
CREATE INDEX "MaterialIssueLine_itemId_idx" ON "MaterialIssueLine"("itemId");

