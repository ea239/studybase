import { prisma } from "@/lib/db";
import type { BriefExcerpt } from "@/lib/ai/assignmentBrief";

// Documents that qualify other work rather than being work themselves: the
// rubric a family of assignments shares, the outline that carries the late
// policy. The item's own page rarely restates any of it, so a brief built from
// that page alone is missing exactly the parts students get caught by.
const GOVERNING = /guideline|rubric|expectation|policy|outline|syllabus|schedule|grading|instruction|overview|handbook/i;

// Words too common in assignment titles to tell one apart from another.
const STOPWORDS = new Set([
  "due", "assignment", "deadline", "submission", "part", "the", "a", "an", "of", "and", "or",
  "for", "to", "in", "on", "at", "individual", "group", "feedback", "final", "draft",
]);

function titleTokens(title: string): string[] {
  return [
    ...new Set(
      title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    ),
  ];
}

// Enough to brief from without sending a course's whole library to the model.
const MAX_EXCERPT_CHARS = 6000;
const MAX_TOTAL_CHARS = 30_000;

function trim(text: string) {
  return text.length > MAX_EXCERPT_CHARS ? `${text.slice(0, MAX_EXCERPT_CHARS)}\n…` : text;
}

/**
 * Collects what is needed to brief one assignment.
 *
 * Three kinds of document matter, and they are rarely the same file: the item's
 * own page, whatever governs it (rubric, guidelines, outline), and the document
 * the due date itself came from. The event's own material is usually only the
 * last of those — a schedule page listing a date — so retrieval cannot simply
 * follow that link.
 */
export async function gatherAssignmentContext(event: {
  id: string;
  title: string;
  subjectId: string;
  materialId: string;
}): Promise<BriefExcerpt[]> {
  const materials = await prisma.material.findMany({
    where: { subjectId: event.subjectId, status: { in: ["DONE", "NEEDS_REVIEW"] } },
    select: {
      id: true,
      filename: true,
      summary: true,
      category: true,
      pages: { orderBy: { pageNumber: "asc" }, select: { pageNumber: true, rawText: true } },
    },
  });

  const tokens = titleTokens(event.title);

  const scored = materials.map((material) => {
    const haystack = `${material.filename} ${material.summary ?? ""}`.toLowerCase();
    const body = material.pages.map((p) => p.rawText).join("\n").toLowerCase();

    // A title word in the filename or summary is a far stronger signal than
    // the same word appearing somewhere in a long document.
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 10;
      if (body.includes(token)) score += 1;
    }

    const governs = GOVERNING.test(material.filename) || GOVERNING.test(material.summary ?? "");
    if (governs) score += 4;
    if (material.category === "OVERVIEW") score += 4;
    if (material.id === event.materialId) score += 3;

    return { material, score, governs };
  });

  const chosen: typeof scored = [];
  const take = (entry: (typeof scored)[number]) => {
    if (!chosen.includes(entry)) chosen.push(entry);
  };

  // The item's own page first: whatever scores highest on its name.
  const byScore = [...scored].sort((a, b) => b.score - a.score);
  for (const entry of byScore.slice(0, 3)) if (entry.score > 0) take(entry);

  // Then the documents that qualify it, even if the item's name never appears
  // in them — a shared rubric usually names the family, not the instance.
  for (const entry of byScore.filter((e) => e.governs || e.material.category === "OVERVIEW").slice(0, 3)) {
    take(entry);
  }

  // And the document the date came from, so the deadline can be cited.
  const source = scored.find((e) => e.material.id === event.materialId);
  if (source) take(source);

  const excerpts: BriefExcerpt[] = [];
  let used = 0;
  for (const { material, governs } of chosen) {
    const role =
      material.id === event.materialId
        ? "date source"
        : governs || material.category === "OVERVIEW"
          ? "guidelines / rubric / outline"
          : "the assignment itself";

    for (const page of material.pages) {
      const text = trim(page.rawText.trim());
      if (!text) continue;
      if (used + text.length > MAX_TOTAL_CHARS) break;
      used += text.length;
      excerpts.push({
        materialId: material.id,
        materialName: material.filename,
        sourcePage: material.pages.length > 1 ? page.pageNumber : null,
        role,
        text,
      });
    }
    if (used >= MAX_TOTAL_CHARS) break;
  }

  return excerpts;
}
