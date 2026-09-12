-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "facts" TEXT,
    "factsStatus" TEXT NOT NULL DEFAULT 'NONE',
    "factsGeneratedAt" DATETIME
);
INSERT INTO "new_Subject" ("createdAt", "id", "name") SELECT "createdAt", "id", "name" FROM "Subject";
DROP TABLE "Subject";
ALTER TABLE "new_Subject" RENAME TO "Subject";
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

