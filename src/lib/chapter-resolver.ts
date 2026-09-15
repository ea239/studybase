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


// Words a course actually calls its teaching units. A chapter labelled with
// one of these is reporting the course's own vocabulary and is left alone.
const STRONG_UNIT_WORDS = ["chapter", "lecture", "unit", "module", "week", "topic", "discussion"];

// Words that get attached to a chapter because they were in a filename, not
// because the course uses them. "part02 - Relational Model" is a file called
// part02; the slides inside call it Chapter 2.
const WEAK_UNIT_WORDS = ["part", "section", "doc", "file", "slides", "deck", "notes", "no", "pt"];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

type ParsedName = { word: string; number: number; title: string } | null;

/** Splits a chapter name into its unit word, number and title. */
export function parseChapterName(name: string): ParsedName {
  const words = [...STRONG_UNIT_WORDS, ...WEAK_UNIT_WORDS].join("|");
  const digits = `\\d{1,3}`;
  const spelled = Object.keys(NUMBER_WORDS).join("|");
  const pattern = new RegExp(
    `^\\s*(${words})\\s*[_\\-.:：]?\\s*(${digits}|${spelled})\\b[\\s_\\-–—:：]*(.*)$`,
    "i"
  );
  const match = name.trim().match(pattern);
  if (!match) return null;

  const [, word, rawNumber, rest] = match;
  const number = /^\d+$/.test(rawNumber)
    ? parseInt(rawNumber, 10)
    : NUMBER_WORDS[rawNumber.toLowerCase()];
  if (number == null || Number.isNaN(number)) return null;

  return { word: word.toLowerCase(), number, title: rest.trim() };
}

function titleCase(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatChapterName(word: string, number: number, title: string) {
  const head = `${titleCase(word)} ${number}`;
  return title ? `${head}: ${title}` : head;
}

/**
 * Makes a subject's chapter names consistent with each other.
 *
 * Two things go wrong on their own. A name can be formatted differently from
 * its neighbours — "Chapter 2 Application Layer" beside "Chapter 3: Transport
 * Layer", or "Module One" beside "Module 2" — which is cosmetic but makes a
 * list look unsorted. And a name can use a word the course does not: a chapter
 * called "part02 - …" was named from a filename before the slides were read,
 * while the course itself says Chapter.
 *
 * Only filename-ish words are replaced. A course that genuinely uses two
 * vocabularies — EARTH 121 has both Modules and Discussions, which are
 * different things — keeps both, because unifying them would collide
 * Discussion 2 with Module 2 and merge two unrelated chapters.
 *
 * Runs after content lands rather than at creation, since the first name a
 * chapter gets is often the provisional one.
 */
export async function normaliseChapterNames(subjectId: string): Promise<number> {
  const chapters = await prisma.chapter.findMany({
    where: { subjectId },
    select: { id: true, name: true },
  });
  if (chapters.length < 2) return 0;

  const parsed = chapters.map((c) => ({ ...c, parts: parseChapterName(c.name) }));

  // The course's own word: the most common strong one it uses.
  const counts = new Map<string, number>();
  for (const c of parsed) {
    if (c.parts && STRONG_UNIT_WORDS.includes(c.parts.word)) {
      counts.set(c.parts.word, (counts.get(c.parts.word) ?? 0) + 1);
    }
  }
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Ordering is grouped by unit word, then by number. A course using two
  // vocabularies (Modules and Discussions) otherwise interleaves them, since
  // both start at 1 — Module 1 landing between Discussion 2 and Discussion 3
  // reads as a list that failed to sort. The course's own word leads.
  const wordRank = new Map<string, number>();
  if (dominant) wordRank.set(dominant, 0);
  for (const c of parsed) {
    if (!c.parts) continue;
    const word = WEAK_UNIT_WORDS.includes(c.parts.word) && dominant ? dominant : c.parts.word;
    if (!wordRank.has(word)) wordRank.set(word, wordRank.size);
  }

  const taken = new Set(chapters.map((c) => c.name));
  let changed = 0;

  for (const chapter of parsed) {
    if (!chapter.parts) continue;
    const { word, number, title } = chapter.parts;
    const useWord = WEAK_UNIT_WORDS.includes(word) && dominant ? dominant : word;
    const next = formatChapterName(useWord, number, title);
    const order = (wordRank.get(useWord) ?? 0) * 1000 + number;
    if (next === chapter.name) {
      await prisma.chapter.update({ where: { id: chapter.id }, data: { order } });
      continue;
    }

    // Renaming onto an existing name would violate the unique constraint, and
    // silently merging two chapters is far worse than an inconsistent name.
    if (taken.has(next)) {
      console.error(`[chapters] 跳过重命名 "${chapter.name}" → "${next}"：该名称已被占用`);
      continue;
    }

    await prisma.chapter.update({ where: { id: chapter.id }, data: { name: next, order } });
    taken.delete(chapter.name);
    taken.add(next);
    changed++;
  }

  return changed;
}
