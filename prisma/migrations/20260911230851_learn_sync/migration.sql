-- AlterTable
ALTER TABLE "Material" ADD COLUMN "learnTopicId" TEXT;
ALTER TABLE "Material" ADD COLUMN "learnUpdatedAt" DATETIME;

-- CreateTable
CREATE TABLE "LearnCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "subjectId" TEXT,
    "lastSyncedAt" DATETIME,
    "lastResult" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearnCourse_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LearnCourse_orgUnitId_key" ON "LearnCourse"("orgUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_learnTopicId_key" ON "Material"("learnTopicId");

