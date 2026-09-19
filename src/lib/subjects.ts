import { prisma } from "@/lib/db";
import { deleteMaterialFiles } from "@/lib/storage";

export type DeletionSummary = {
  name: string;
  materials: number;
  chapters: number;
  events: number;
  knowledgePoints: number;
  questions: number;
  learnCourses: number;
};

/** What deleting this course would take with it. */
export async function describeSubjectDeletion(subjectId: string): Promise<DeletionSummary | null> {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { name: true },
  });
  if (!subject) return null;

  const [materials, chapters, events, knowledgePoints, questions, learnCourses] = await Promise.all([
    prisma.material.count({ where: { subjectId } }),
    prisma.chapter.count({ where: { subjectId } }),
    prisma.courseEvent.count({ where: { subjectId } }),
    prisma.knowledgePoint.count({ where: { material: { subjectId } } }),
    prisma.question.count({ where: { material: { subjectId } } }),
    prisma.learnCourse.count({ where: { subjectId } }),
  ]);

  return { name: subject.name, materials, chapters, events, knowledgePoints, questions, learnCourses };
}

/**
 * Deletes a course and everything belonging to it.
 *
 * Materials are removed explicitly rather than left to the database. Their
 * link to a subject is nullable — a material can sit unfiled — so deleting the
 * subject would otherwise orphan them: every file still on disk, every
 * knowledge point still searchable, under no course. That is the opposite of
 * what deleting a course means.
 *
 * Files go before rows. A row without its files shows as a material that
 * cannot be opened; a file without its row is invisible and stays forever.
 */
export async function deleteSubject(subjectId: string): Promise<DeletionSummary | null> {
  const summary = await describeSubjectDeletion(subjectId);
  if (!summary) return null;

  const materials = await prisma.material.findMany({
    where: { subjectId },
    select: { id: true, storagePath: true },
  });
  for (const material of materials) {
    await deleteMaterialFiles(material.id, material.storagePath);
  }

  // Unmapped and switched off, not just unmapped: a LEARN course left enabled
  // would re-import the whole thing on the next sync, and a course deleted on
  // purpose reappearing overnight is worse than having to re-enable it.
  await prisma.learnCourse.updateMany({
    where: { subjectId },
    data: { subjectId: null, enabled: false, lastResult: `所属科目「${summary.name}」已删除，同步已关闭` },
  });

  await prisma.material.deleteMany({ where: { subjectId } });
  // Chapters and events cascade from the subject; materials took their pages,
  // knowledge points and questions with them.
  await prisma.subject.delete({ where: { id: subjectId } });

  return summary;
}
