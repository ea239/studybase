import { prisma } from "@/lib/db";

// Every word a course uses for "the nth teaching unit". Missing one is not a
// harmless gap: an unrecognised label falls back to matching on the whole
// string, so a deck whose slides each carry their own heading turns into a
// chapter per slide. That is what "lecture" being absent here did to a single
// ECE 307 deck — eleven chapters, one per section of Lecture 4.
const UNIT_WORDS =
  /(?:chapter|chap|ch|unit|week|lecture|lec|module|topic|part|第|讲|课)[\s_\-.:]*0*(\d+)/i;

// Groups chapter labels by their leading number ("Chapter 3", "第3章", "Unit 3",
// "Week 3" all key to "3") so the same chapter matches across documents even
// when the AI phrases the title slightly differently each time. The separator
// is deliberately loose: filenames carry the number as "Chapter_1_Introduction"
// just as often as "Chapter 1". Falls back to the normalized full string when
// no number is present.
function chapterKey(label: string): string {
  const match = label.match(UNIT_WORDS);
  if (match) return match[1];
  return label.trim().toLowerCase();
}

// Trims a trailing section heading off a chapter title, so the chapter is
// named for the lecture rather than for whichever of its slides happened to be
// extracted first ("Lecture 4: Probability Review II - Expectation").
//
// Only applies when a colon has already introduced the title: a dash is then
// clearly starting something further down, whereas in "Chapter 3 - Query
// Optimization" the dash introduces the title itself and must be kept.
function chapterName(label: string): string {
  const trimmed = label.trim();
  const match = trimmed.match(/^(.*?[::]\s*[^-–—]+?)\s*[-–—]\s*\S.*$/);
  return (match?.[1] ?? trimmed).trim();
}

// The descriptive part of a label, with any leading unit or course-code prefix
// removed: "Chapter 2 Application Layer" and "ECE 358: Application Layer" both
// reduce to "application layer".
//
// This is the fallback for labels carrying no unit number at all — a question
// bank that heads its sections with the course code rather than the chapter
// number would otherwise build a second, parallel set of chapters alongside
// the lecture notes'. Matching is exact on the whole descriptive part, never
// on a substring: under-merging leaves a tidy-up, whereas merging two
// genuinely different chapters silently mixes their content.
function chapterTitle(label: string): string {
  return label
    .replace(UNIT_WORDS, "")
    .replace(/^\s*[A-Za-z]{2,6}\s*\d{2,4}\s*/, "")
    .replace(/^[\s_\-.:：]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

  let match = existing.find((c) => chapterKey(c.name) === key);

  // No unit number in this label: fall back to matching an existing chapter by
  // its title, so "ECE 358: Application Layer" lands in "Chapter 2 Application
  // Layer" rather than starting a chapter of its own.
  if (!match && !/^\d+$/.test(key)) {
    const title = chapterTitle(label);
    if (title) match = existing.find((c) => chapterTitle(c.name) === title);
  }

  if (match) {
    cache.set(cacheKey, match.id);
    return match.id;
  }

  const numeric = /^\d+$/.test(key) ? parseInt(key, 10) : null;
  const created = await prisma.chapter.create({
    data: {
      subjectId,
      name: chapterName(label),
      order: numeric ?? existing.length + 1,
    },
  });
  cache.set(cacheKey, created.id);
  return created.id;
}
