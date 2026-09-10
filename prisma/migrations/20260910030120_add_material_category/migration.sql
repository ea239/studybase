-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'PDF',
    "category" TEXT NOT NULL DEFAULT 'NOTES',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "subjectId" TEXT,
    "courseId" TEXT,
    "chapterId" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Material_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Material_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Material_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Material" ("chapterId", "courseId", "createdAt", "errorMessage", "fileType", "filename", "id", "status", "storagePath", "subjectId", "summary", "updatedAt") SELECT "chapterId", "courseId", "createdAt", "errorMessage", "fileType", "filename", "id", "status", "storagePath", "subjectId", "summary", "updatedAt" FROM "Material";
DROP TABLE "Material";
ALTER TABLE "new_Material" RENAME TO "Material";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
