-- CreateTable
CREATE TABLE "StockCount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "countNo" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedById" INTEGER,
    "completedById" INTEGER,
    "completedAt" DATETIME,
    "countDate" DATETIME,
    "notes" TEXT,
    CONSTRAINT "StockCount_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockCount_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "countId" INTEGER NOT NULL,
    "lotId" INTEGER NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "reason" TEXT,
    "transactionId" INTEGER,
    CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCountLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCountLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "InventoryTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_countNo_key" ON "StockCount"("countNo");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_period_key" ON "StockCount"("period");

-- CreateIndex
CREATE INDEX "StockCount_status_idx" ON "StockCount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_transactionId_key" ON "StockCountLine"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_lotId_key" ON "StockCountLine"("countId", "lotId");

