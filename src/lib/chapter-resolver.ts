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

// Finds the chapter among `pool` whose title says the same thing as `label`'s.
//
// Exact on the whole descriptive part, or — for a title of at least two words
// — contained word-for-word in the candidate's, so "Link Layer" joins "The
// Link Layer and LANs". The two-word floor stops a one-word heading like
// "Overview" swallowing an unrelated chapter, and the closest fit wins so a
// terse heading joins the chapter that adds least to it.
function matchByTitle<T extends { name: string }>(label: string, pool: T[]): T | undefined {
  const title = chapterTitle(label);
  const words = new Set(title.split(" ").filter(Boolean));
  if (!words.size) return undefined;

  return pool
    .filter((c) => {
      const other = chapterTitle(c.name);
      if (other === title) return true;
      if (words.size < 2 || !other) return false;
      const otherWords = new Set(other.split(" ").filter(Boolean));
      return [...words].every((w) => otherWords.has(w));
    })
    .sort((a, b) => chapterTitle(a.name).length - chapterTitle(b.name).length)[0];
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
// A course code on its own — "ECE 356", "ECE356 F26" — is the running header
// of every slide in the course, so it names no chapter. The model is told not
// to use it, but this is the backstop: one bad label creates a real chapter
// row that then collects items for the rest of the term.
const COURSE_CODE_ONLY = /^[a-z]{2,6}\s*\d{2,4}[a-z]?(\s*[-–:]\s*.{0,4})?$/i;

function isNotAChapter(label: string, subjectName: string): boolean {
  const normalised = label.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalised) return true;
  if (normalised === subjectName.trim().toLowerCase()) return true;
  return COURSE_CODE_ONLY.test(normalised);
}

/**
 * Finds or creates the chapter for a label, or returns null when the label
 * does not name one.
 */
export async function resolveChapter(
  subjectId: string,
  label: string,
  cache: Map<string, string>
): Promise<string | null> {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { name: true },
  });
  if (subject && isNotAChapter(label, subject.name)) return null;

  const key = chapterKey(label);
  const cacheKey = `${subjectId}::${key}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const existing = await prisma.chapter.findMany({ where: { subjectId } });

  const numbered = (c: { name: string }) => /^\d+$/.test(chapterKey(c.name));

  // A label carrying a unit number is unambiguous: match on the number alone.
  let match = /^\d+$/.test(key) ? existing.find((c) => chapterKey(c.name) === key) : undefined;

  if (!match && !/^\d+$/.test(key)) {
    // No unit number in the label. A numbered chapter is the canonical unit,
    // so try to join one of those by title first — including in preference to
    // a numberless chapter of this exact name, which is likely an artefact of
    // an earlier run that had no numbered chapter to join yet.
    match =
      matchByTitle(label, existing.filter(numbered)) ??
      matchByTitle(label, existing) ??
      existing.find((c) => chapterKey(c.name) === key);
  }

  if (match) {
    // Heal a name left over from an earlier run that carried a section
    // heading, now that the matching label has arrived — otherwise the chapter
    // keeps a title like "Lecture 4: Probability Review II - Expectation"
    // forever, just because that slide was extracted first.
    const tidied = chapterName(match.name);
    if (tidied !== match.name) {
      await prisma.chapter.update({ where: { id: match.id }, data: { name: tidied } });
    }
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
