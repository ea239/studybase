import { prisma } from "@/lib/db";

// Groups chapter labels by their leading number ("Chapter 3", "第3章", "Unit 3",
// "Week 3" all key to "3") so the same chapter matches across documents even
// when the AI phrases the title slightly differently each time. Falls back to
// the normalized full string when no number is present.
function chapterKey(label: string): string {
  const match = label.match(/(?:chapter|ch\.?|unit|week|第)\s*0*(\d+)/i);
  if (match) return match[1];
  return label.trim().toLowerCase();
}

// Finds an existing chapter under this subject matching the label (by
// number, or by normalized name), or creates one. Callers must await calls
// to this one at a time per subject — concurrent calls for a never-seen
// label would both find nothing and both try to create it, violating the
// (subjectId, name) unique constraint.
export async function resolveChapter(
  subjectId: string,
  label: string,
  cache: Map<string, string>
): Promise<string> {
  const key = chapterKey(label);
  const cacheKey = `${subjectId}::${key}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const existing = await prisma.chapter.findMany({ where: { subjectId } });
  const match = existing.find((c) => chapterKey(c.name) === key);
  if (match) {
    cache.set(cacheKey, match.id);
    return match.id;
  }

  const numeric = /^\d+$/.test(key) ? parseInt(key, 10) : null;
  const created = await prisma.chapter.create({
    data: {
      subjectId,
      name: label.trim(),
      order: numeric ?? existing.length + 1,
    },
  });
  cache.set(cacheKey, created.id);
  return created.id;
}
