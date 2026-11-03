-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "formNo" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "codePrefix" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'units',
    "parentId" INTEGER,
    "testPath" TEXT,
    "config" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("codePrefix", "config", "id", "name", "parentId", "testPath") SELECT "codePrefix", "config", "id", "name", "parentId", "testPath" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE UNIQUE INDEX "Category_formNo_key" ON "Category"("formNo");
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Category_codePrefix_key" ON "Category"("codePrefix");
CREATE TABLE "new_Item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "legacyCode" TEXT,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "subType" TEXT,
    "specs" TEXT NOT NULL DEFAULT '{}',
    "owner" TEXT NOT NULL DEFAULT 'SVLSG',
    "dedicatedProduct" TEXT,
    "supplierId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Item_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Item" ("active", "categoryId", "code", "createdAt", "id", "legacyCode", "name", "specs") SELECT "active", "categoryId", "code", "createdAt", "id", "legacyCode", "name", "specs" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

