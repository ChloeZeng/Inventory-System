-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Location" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Room" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "locationId" INTEGER NOT NULL,
    CONSTRAINT "Room_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "codePrefix" TEXT NOT NULL,
    "parentId" INTEGER,
    "testPath" TEXT,
    "config" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "aslApproved" BOOLEAN NOT NULL DEFAULT false,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "legacyCode" TEXT,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "specs" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Receipt" (
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
    "quarantineStickerApplied" BOOLEAN NOT NULL DEFAULT false,
    "receivedById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Receipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lot" (
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
    "operatorId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER,
    "receiptId" INTEGER,
    "itemId" INTEGER,
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
    CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "inspectionLevel" TEXT NOT NULL DEFAULT 'II',
    "lotSize" INTEGER NOT NULL,
    "codeLetter" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "casesSampled" INTEGER,
    "itemsSampled" INTEGER,
    "checklist" TEXT NOT NULL DEFAULT '{}',
    "criticalDefects" INTEGER NOT NULL DEFAULT 0,
    "majorDefects" INTEGER NOT NULL DEFAULT 0,
    "minorDefects" INTEGER NOT NULL DEFAULT 0,
    "defectNotes" TEXT,
    "comments" TEXT,
    "calculatedDisposition" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "overrideReason" TEXT,
    "inspectedById" INTEGER NOT NULL,
    "inspectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Inspection_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Inspection_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "roomId" INTEGER,
    "productOrCustomer" TEXT,
    "date" DATETIME NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "AnsiCodeLetter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "inspectionLevel" TEXT NOT NULL,
    "minLotSize" INTEGER NOT NULL,
    "maxLotSize" INTEGER,
    "codeLetter" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AnsiSampleSize" (
    "codeLetter" TEXT NOT NULL PRIMARY KEY,
    "sampleSize" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "AnsiPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codeLetter" TEXT NOT NULL,
    "aql" TEXT NOT NULL,
    "ac" INTEGER,
    "re" INTEGER,
    "arrow" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "User_initials_key" ON "User"("initials");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Room_locationId_name_key" ON "Room"("locationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_codePrefix_key" ON "Category"("codePrefix");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receivingNo_key" ON "Receipt"("receivingNo");

-- CreateIndex
CREATE INDEX "Lot_qcStatus_idx" ON "Lot"("qcStatus");

-- CreateIndex
CREATE INDEX "InventoryTransaction_lotId_idx" ON "InventoryTransaction"("lotId");

-- CreateIndex
CREATE INDEX "AuditLog_tableName_recordId_idx" ON "AuditLog"("tableName", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "AnsiCodeLetter_inspectionLevel_minLotSize_key" ON "AnsiCodeLetter"("inspectionLevel", "minLotSize");

-- CreateIndex
CREATE UNIQUE INDEX "AnsiSampleSize_sortOrder_key" ON "AnsiSampleSize"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AnsiPlan_codeLetter_aql_key" ON "AnsiPlan"("codeLetter", "aql");
