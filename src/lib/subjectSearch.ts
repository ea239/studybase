import { prisma } from "@/lib/db";

export type SearchHit = {
  kind: "point" | "page" | "event";
  materialId: string | null;
  materialName: string;
  sourcePage: number | null;
  /** Where the app should go when this hit is opened. */
  href: string;
  title: string;
  text: string;
  score: number;
};

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "is", "are", "what", "when", "how", "for", "to", "in", "on",
  "at", "do", "does", "i", "my", "me", "it", "this", "that",
  "的", "是", "了", "在", "我", "什么", "怎么", "如何", "哪些", "有没有",
]);

export function tokenize(query: string): string[] {
  const latin = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  // CJK has no spaces, so words never survive the split above. Bigrams are a
  // crude but effective stand-in: "评分标准" yields 评分/分标/标准, and the
  // real term scores on several of them.
  const cjk = query.match(/[一-鿿]{2,}/g) ?? [];
  const bigrams = cjk.flatMap((run) =>
    Array.from({ length: run.length - 1 }, (_, i) => run.slice(i, i + 2))
  );

  return [...new Set([...latin, ...bigrams])].filter((t) => !STOPWORDS.has(t));
}

function score(haystack: string, tokens: string[]) {
  const hay = haystack.toLowerCase();
  let hits = 0;
  for (const token of tokens) if (hay.includes(token)) hits++;
  return hits;
}

const MAX_SNIPPET = 700;

/** The passage around the first matching token, rather than the opening lines. */
function snippet(text: string, tokens: string[]) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const token of tokens) {
    const i = lower.indexOf(token);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, MAX_SNIPPET);
  const start = Math.max(0, at - 200);
  return (start > 0 ? "…" : "") + text.slice(start, start + MAX_SNIPPET);
}

/**
 * Finds what in a subject bears on a question.
 *
 * Searches the extracted knowledge points, the raw page text, and the dated
 * items together: a question like "late policy" is usually answered by a
 * sentence in a document that no knowledge point happens to cover, and "when
 * is X due" by a date that lives in neither.
 */
export async function searchSubject(
  subjectId: string,
  query: string,
  extraTerms: string[] = [],
  limit = 12
): Promise<SearchHit[]> {
  // The expanded terms carry the cross-language and resolved-reference work;
  // the question's own words stay in so an exact phrase still wins.
  const tokens = [...new Set([...tokenize(query), ...extraTerms.flatMap((t) => tokenize(t))])];
  if (tokens.length === 0) return [];

  const [points, pages, events] = await Promise.all([
    prisma.knowledgePoint.findMany({
      where: { material: { subjectId } },
      select: {
        title: true,
        content: true,
        sourcePage: true,
        material: { select: { id: true, filename: true } },
        chapter: { select: { id: true, name: true } },
      },
    }),
    prisma.materialPage.findMany({
      where: { material: { subjectId } },
      select: { pageNumber: true, rawText: true, material: { select: { id: true, filename: true } } },
    }),
    prisma.courseEvent.findMany({ where: { subjectId } }),
  ]);

  const hits: SearchHit[] = [];

  for (const p of points) {
    const s = score(`${p.title} ${p.content}`, tokens);
    if (!s) continue;
    hits.push({
      kind: "point",
      materialId: p.material.id,
      materialName: p.material.filename,
      sourcePage: p.sourcePage,
      href: p.chapter ? `/subjects/${subjectId}?tab=lecture&chapter=${p.chapter.id}` : `/materials/${p.material.id}`,
      title: p.title,
      // Knowledge points are already condensed, so they are worth more per
      // character than the raw page they came from.
      text: p.content,
      score: s * 2,
    });
  }

  for (const page of pages) {
    const s = score(page.rawText, tokens);
    if (!s) continue;
    hits.push({
      kind: "page",
      materialId: page.material.id,
      materialName: page.material.filename,
      sourcePage: page.pageNumber,
      href: `/materials/${page.material.id}`,
      title: `${page.material.filename} 第 ${page.pageNumber} 页`,
      text: snippet(page.rawText, tokens),
      score: s,
    });
  }

  for (const e of events) {
    const s = score(`${e.title} ${e.approxLabel ?? ""}`, tokens);
    if (!s) continue;
    const when =
      e.startsAt && e.precision === "EXACT"
        ? e.startsAt.toISOString().slice(0, 16).replace("T", " ")
        : e.startsAt && e.endsAt
          ? `${e.startsAt.toISOString().slice(0, 10)} – ${e.endsAt.toISOString().slice(0, 10)}`
          : (e.approxLabel ?? "待公布");
    hits.push({
      kind: "event",
      materialId: e.materialId,
      materialName: "课程日程",
      sourcePage: null,
      href: `/subjects/${subjectId}?tab=work&item=${e.id}`,
      title: e.title,
      text: `${e.title} — ${when}${e.completedAt ? "（已标记完成）" : ""}`,
      // A dated item is the whole answer to "when is this due", so it
      // outranks a document that merely mentions the name.
      score: s * 3,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * A compact description of what the course contains.
 *
 * Sent with every question, not just when something matched. Most of what a
 * student asks a course is structural — when is the first assignment due, how
 * many chapters are there, what is the final worth — and that is answered by
 * knowing the shape of the course, which no amount of keyword matching against
 * slide text reliably surfaces.
 */
export async function courseCatalogue(subjectId: string): Promise<string> {
  const [subject, chapters, events] = await Promise.all([
    prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true, facts: true } }),
    prisma.chapter.findMany({
      where: { subjectId },
      orderBy: { order: "asc" },
      select: { name: true, _count: { select: { knowledgePoints: true, questions: true } } },
    }),
    prisma.courseEvent.findMany({ where: { subjectId }, orderBy: [{ startsAt: "asc" }] }),
  ]);
  if (!subject) return "";

  const lines: string[] = [`Course: ${subject.name}`];

  try {
    const parsed = subject.facts ? JSON.parse(subject.facts) : null;
    if (parsed?.version === 1 && Array.isArray(parsed.facts) && parsed.facts.length) {
      lines.push(
        "Key facts:",
        ...parsed.facts.map((f: { label: string; value: string }) => `- ${f.label}: ${f.value}`)
      );
    }
  } catch {
    // Facts in an older shape are simply left out.
  }

  if (chapters.length) {
    lines.push(
      "Chapters, in order:",
      ...chapters.map((c, i) => `- ${i + 1}. ${c.name} (${c._count.knowledgePoints} points, ${c._count.questions} questions)`)
    );
  }

  if (events.length) {
    // Numbered in date order, because "the first assignment" is a position in
    // this list and nothing in the documents says so.
    const work = events.filter((e) => e.kind !== "OTHER");
    const other = events.filter((e) => e.kind === "OTHER");
    const describe = (e: (typeof events)[number]) => {
      const when =
        e.precision === "EXACT" && e.startsAt
          ? e.startsAt.toISOString().slice(0, 16).replace("T", " ")
          : e.startsAt && e.endsAt
            ? `${e.startsAt.toISOString().slice(0, 10)} to ${e.endsAt.toISOString().slice(0, 10)} (window, not a fixed date)`
            : (e.approxLabel ?? "date not announced");
      return `${e.title} — ${e.kind} — ${when}${e.completedAt ? " — marked done" : ""}`;
    };
    if (work.length) {
      lines.push(
        "Assessed work and exams, in date order:",
        ...work.map((e, i) => `- ${i + 1}. ${describe(e)}`)
      );
    }
    if (other.length) {
      lines.push("Other dates:", ...other.map((e) => `- ${describe(e)}`));
    }
  }

  return lines.join("\n");
}
