-- CreateTable
CREATE TABLE "CourseEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "sourcePage" INTEGER,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "precision" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "approxLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseEvent_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseEvent_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CourseEvent_subjectId_startsAt_idx" ON "CourseEvent"("subjectId", "startsAt");

