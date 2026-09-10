import { prisma } from "@/lib/db";

// GPT callers rarely know internal ids — they say "ECE 356", not a cuid.
// Try an exact id match first (cheap, common for follow-up calls once the
// model has seen an id), then fall back to a case-insensitive name search.
export async function resolveSubject(identifier: string) {
  const byId = await prisma.subject.findUnique({ where: { id: identifier } });
  if (byId) return byId;
  return prisma.subject.findFirst({ where: { name: { contains: identifier } } });
}

export async function resolveChapter(subjectId: string, identifier: string) {
  const byId = await prisma.chapter.findUnique({ where: { id: identifier } });
  if (byId && byId.subjectId === subjectId) return byId;
  return prisma.chapter.findFirst({ where: { subjectId, name: { contains: identifier } } });
}
