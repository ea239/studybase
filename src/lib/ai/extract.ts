import { z } from "zod";
import { chatJSON } from "./provider";
import { pickModel } from "./routing";
import type { AiSettings } from "./types";
import type { ExtractedPage } from "@/lib/pdf";

// Models are told fields are optional/nullable but routinely send explicit
// `null` for "no value" instead of omitting the key — every optional field
// here must tolerate both, or a single stray null fails the whole extraction.
const extractionSchema = z.object({
  summary: z.string(),
  knowledgePoints: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      sourcePage: z.number().int().nullable().optional(),
      chapter: z.string().nullable().optional(),
      tags: z
        .array(z.string())
        .nullable()
        .optional()
        .transform((v) => v ?? []),
      confidence: z.number().min(0).max(1).nullable().optional(),
    })
  ),
  questions: z.array(
    z.object({
      stem: z.string(),
      options: z.array(z.string()).nullable().optional(),
      answer: z.string(),
      explanation: z.string().nullable().optional(),
      sourcePage: z.number().int().nullable().optional(),
      chapter: z.string().nullable().optional(),
      difficulty: z
        .enum(["EASY", "MEDIUM", "HARD"])
        .nullable()
        .optional()
        .transform((v) => v ?? "MEDIUM"),
      confidence: z.number().min(0).max(1).nullable().optional(),
    })
  ),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

// How much source text goes into one extraction request.
//
// Splitting is a safety net for documents genuinely too large to answer in one
// go — not a performance measure. It costs more than it saves below that line:
// every call carries a fixed overhead, so a document split in three pays for
// an outline pass, three extractions and a summary where one call would have
// done. The threshold sits above the largest real file seen so far (a 44-page
// question bank, 49k characters, which answers in ~90 seconds as a single
// request) precisely so that file does not get split.
const CHUNK_CHARS = 40_000;

function pageBlock(page: ExtractedPage) {
  return `\n--- Page ${page.pageNumber} ---\n${page.text}`;
}

function joinPages(pages: ExtractedPage[]) {
  return pages.map(pageBlock).join("");
}

const outlineSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z.string(),
        startPage: z.number().int(),
      })
    )
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});

const OUTLINE_SYSTEM_PROMPT = `You are given the opening lines of every page of a document, in order. Identify the sections the document is divided into — lecture sections, topic headings, numbered units, question-bank sections, and so on — using the titles exactly as they appear in the text.

Report each section once, with the page it starts on. Do not invent sections that are not indicated by the text, and do not split a section just because it spans several pages. If the document has no visible section structure at all, return an empty array.

Return JSON matching this shape exactly:
{ "sections": [{ "title": string, "startPage": number }] }`;

/**
 * Asks for the document's section titles and where each starts.
 *
 * Only the opening lines of each page are sent, which keeps this cheap even
 * for a long document, and is enough to spot headings. Returns an empty
 * outline on any failure — chunking then falls back to splitting purely on
 * size, which is worse but still works.
 */
async function deriveOutline(settings: AiSettings, pages: ExtractedPage[]) {
  const digest = pages
    .map((p) => `Page ${p.pageNumber}: ${p.text.trim().slice(0, 250).replace(/\s+/g, " ")}`)
    .join("\n");
  try {
    const raw = await chatJSON(settings, OUTLINE_SYSTEM_PROMPT, digest);
    return outlineSchema.parse(raw).sections;
  } catch (err) {
    console.error("[extract] 大纲识别失败，改为按长度切分:", err);
    return [];
  }
}

type Chunk = { sectionTitles: string[]; pages: ExtractedPage[] };

/**
 * Groups pages into requests along section boundaries, so a chunk is a
 * coherent unit rather than an arbitrary page cut. A section too large to fit
 * is split across several chunks; small ones are packed together.
 */
function planChunks(pages: ExtractedPage[], outline: { title: string; startPage: number }[]): Chunk[] {
  const valid = new Set(pages.map((p) => p.pageNumber));
  const marks = outline
    .filter((s) => valid.has(s.startPage) && s.title.trim())
    .sort((a, b) => a.startPage - b.startPage);

  // Pages grouped under the section they belong to. Anything before the first
  // heading (title page, table of contents) forms an untitled leading group.
  const groups: { title: string; pages: ExtractedPage[] }[] = [];
  if (marks.length === 0) {
    groups.push({ title: "", pages });
  } else {
    const lead = pages.filter((p) => p.pageNumber < marks[0].startPage);
    if (lead.length) groups.push({ title: "", pages: lead });
    marks.forEach((mark, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].startPage : Infinity;
      const owned = pages.filter((p) => p.pageNumber >= mark.startPage && p.pageNumber < end);
      if (owned.length) groups.push({ title: mark.title.trim(), pages: owned });
    });
  }

  const chunks: Chunk[] = [];
  let current: Chunk = { sectionTitles: [], pages: [] };
  let currentChars = 0;
  const flush = () => {
    if (current.pages.length) chunks.push(current);
    current = { sectionTitles: [], pages: [] };
    currentChars = 0;
  };

  for (const group of groups) {
    const groupChars = group.pages.reduce((sum, p) => sum + pageBlock(p).length, 0);

    if (groupChars > CHUNK_CHARS) {
      // Too big on its own: break it up, every part keeping the section title
      // so the model still knows what it is reading.
      flush();
      let part: ExtractedPage[] = [];
      let partChars = 0;
      for (const page of group.pages) {
        const len = pageBlock(page).length;
        if (part.length && partChars + len > CHUNK_CHARS) {
          chunks.push({ sectionTitles: group.title ? [group.title] : [], pages: part });
          part = [];
          partChars = 0;
        }
        part.push(page);
        partChars += len;
      }
      if (part.length) chunks.push({ sectionTitles: group.title ? [group.title] : [], pages: part });
      continue;
    }

    if (current.pages.length && currentChars + groupChars > CHUNK_CHARS) flush();
    if (group.title) current.sectionTitles.push(group.title);
    current.pages.push(...group.pages);
    currentChars += groupChars;
  }
  flush();

  return chunks;
}

/**
 * One chunk's user message. Every chunk carries the whole document's section
 * titles — titles only, not their text — so the model can place what it is
 * reading within the document instead of treating the fragment as the whole.
 */
function buildChunkPrompt(chunk: Chunk, allTitles: string[], index: number, total: number) {
  const parts: string[] = [];

  if (allTitles.length) {
    parts.push(
      `For context, the full document is organised into these sections (titles only — the text of most of them is NOT shown below):\n` +
        allTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
    );
  }

  const covering = chunk.sectionTitles.length ? `, covering: ${chunk.sectionTitles.join("; ")}` : "";
  parts.push(
    `This is part ${index + 1} of ${total} of the document${covering}. ` +
      `Extract ONLY from the pages given below. Do not produce anything for the other sections listed above — they are shown purely so you know where this part sits.`
  );

  parts.push(joinPages(chunk.pages));
  return parts.join("\n\n");
}

const SUMMARY_SYSTEM_PROMPT = `You are given the per-part summaries of one document, in order. Write a single summary of the whole document in 2-4 sentences, in the same language as the input. Return JSON matching this shape exactly: { "summary": string }`;

/** Folds the per-chunk summaries into one. Falls back to joining them. */
async function mergeSummaries(settings: AiSettings, summaries: string[]) {
  const joined = summaries.filter(Boolean).join(" ");
  if (summaries.length <= 1) return joined;
  try {
    const raw = await chatJSON(settings, SUMMARY_SYSTEM_PROMPT, joined);
    const parsed = z.object({ summary: z.string() }).parse(raw);
    return parsed.summary;
  } catch (err) {
    console.error("[extract] 汇总摘要失败，改为拼接各部分摘要:", err);
    return joined;
  }
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Concatenates the chunks' results, dropping repeats.
 *
 * Sections overlap at their edges and a heading often restates a definition,
 * so the same item can come back from two chunks. Matching on title *and* the
 * start of the content keeps genuinely distinct items that happen to share a
 * title, which matters for things like "Example 1" appearing in each section.
 */
function mergeResults(results: ExtractionResult[]): Omit<ExtractionResult, "summary"> {
  const knowledgePoints: ExtractionResult["knowledgePoints"] = [];
  const questions: ExtractionResult["questions"] = [];
  const seenPoints = new Set<string>();
  const seenQuestions = new Set<string>();

  for (const result of results) {
    for (const point of result.knowledgePoints) {
      const key = `${normalise(point.title)}|${normalise(point.content).slice(0, 80)}`;
      if (seenPoints.has(key)) continue;
      seenPoints.add(key);
      knowledgePoints.push(point);
    }
    for (const question of result.questions) {
      const key = normalise(question.stem);
      if (seenQuestions.has(key)) continue;
      seenQuestions.add(key);
      questions.push(question);
    }
  }

  return { knowledgePoints, questions };
}

const NOTES_SYSTEM_PROMPT = `You are an assistant that turns study material (lecture slides, textbook excerpts, notes) into structured study content.

Given the raw text of a document, page by page, extract:
1. A short summary (2-4 sentences) of what the document covers.
2. Knowledge points: definitions, formulas, key concepts, and worked examples. Each must cite the page number it came from.
3. Questions: any exercises, practice problems, or quiz questions found in the text, with their answer and explanation if present. Each must cite the page number it came from. Do not invent questions that are not in the text — only extract ones that actually appear.

For every knowledge point and question, also determine which chapter/unit/week it belongs to, using the actual titles, headers, or running headers that appear in the source text itself (e.g. a title slide reading "Chapter 3: Query Optimization", a running header, a slide footer showing a unit number, "第三章", "Week 5", "Unit 2"). Put this in a "chapter" field, using the chapter number and title as it literally appears in the source (e.g. "Chapter 3: Query Optimization").

A chapter is a teaching unit — a lecture, chapter or week — not a section heading within one. A slide titled "Variance" inside "Lecture 4: Probability Review II" belongs to chapter "Lecture 4: Probability Review II"; it is not its own chapter, and not "Lecture 4: Probability Review II - Variance" either. Whenever two items belong to the same unit, give the chapter string identically both times, so they group together.

How many chapters a document covers depends on the document. A lecture deck is one unit, so every item in it takes the same chapter. A question bank, review sheet or exam paper is usually organised by chapter and covers many, so each item takes the chapter of the section it sits under — do not collapse those onto a single chapter. Prefer the unit's own number and title ("Chapter 3: Transport Layer") over a heading that merely repeats the course code ("ECE 358: Transport Layer"), when both appear.

If the document gives no chapter/unit/week indication anywhere, leave "chapter" as null — do not guess or invent one.

Write every formula, equation, and mathematical symbol as LaTeX — the app typesets it. Never write maths as plain text or Unicode symbols: no Σ, ∫, μ, σ, ², √, ≤, ∞, α, ×, ≈, or similar characters outside LaTeX. A "→" joining steps in prose is not maths and may stay as it is; an arrow inside a formula is \\to, in LaTeX. Inline maths takes single dollars ($E[X] = \\mu$, $O(n \\log n)$, $12\\%$); a formula that stands on its own takes double dollars ($$\\text{CPI} = \\sum_i f_i c_i$$). This applies to question stems, options, answers and explanations alike — a numeric answer like $3.4$ cycles is maths too.

For every knowledge point and question, include a "confidence" score from 0 to 1 reflecting how certain you are about the page number and correctness of the extraction. Use a lower score when the source text is garbled, ambiguous, or you had to infer structure.

Return JSON matching this shape exactly:
{
  "summary": string,
  "knowledgePoints": [{ "title": string, "content": string, "sourcePage": number, "chapter": string | null, "tags": string[], "confidence": number }],
  "questions": [{ "stem": string, "options": string[] | null, "answer": string, "explanation": string, "sourcePage": number, "chapter": string | null, "difficulty": "EASY"|"MEDIUM"|"HARD", "confidence": number }]
}`;

// For overview documents (syllabus, grading breakdown, course schedule).
// These don't have knowledge points or exercises — instead they describe the
// course itself. Reuses the same knowledgePoints[] shape so the pipeline and
// DB writes stay identical; each item is just a course-structure fact rather
// than a concept, distinguished by its "tags".
const OVERVIEW_SYSTEM_PROMPT = `You are an assistant that turns a course overview document (syllabus, grading policy, course schedule/outline) into structured course information.

Given the raw text of a document, page by page, extract:
1. A short summary (2-4 sentences) of what the document covers — e.g. course name, instructor, credits, term.
2. Course structure items, each with a "title", "content", the page it came from, and a "tags" array using EXACTLY one of: ["basic-info"] for course name/instructor/credits/term, ["schedule"] for a week/topic/unit in the course outline, ["grading"] for a grading component and its weight (e.g. "期末考试 40%"), ["deadline"] for an assignment/exam date. One item per fact — do not bundle the whole grading table into a single item.
Leave "questions" as an empty array — overview documents don't contain exercises.

For every item, include a "confidence" score from 0 to 1 reflecting how certain you are about the page number and correctness of the extraction. Use a lower score when the source text is garbled, ambiguous, or you had to infer structure.

Return JSON matching this shape exactly:
{
  "summary": string,
  "knowledgePoints": [{ "title": string, "content": string, "sourcePage": number, "tags": string[], "confidence": number }],
  "questions": []
}`;

// For lab manuals / assignment sheets. Like overview docs, these describe a
// task rather than teach a concept — reuses the same knowledgePoints[] shape.
const LAB_SYSTEM_PROMPT = `You are an assistant that turns a lab manual or assignment sheet into structured task information.

Given the raw text of a document, page by page, extract:
1. A short summary (2-4 sentences): which lab/assignment this is and what it's about.
2. Task items, each with a "title", "content", the page it came from, and a "tags" array using EXACTLY one of: ["lab-info"] for the lab/assignment number, title, or topic, ["requirement"] for a deliverable, step, or what must be submitted and how, ["grading"] for a point value or grading criterion, ["deadline"] for a due date. One item per fact — do not bundle the whole requirements list into a single item.
Leave "questions" as an empty array.

For every item, include a "confidence" score from 0 to 1 reflecting how certain you are about the page number and correctness of the extraction. Use a lower score when the source text is garbled, ambiguous, or you had to infer structure.

Return JSON matching this shape exactly:
{
  "summary": string,
  "knowledgePoints": [{ "title": string, "content": string, "sourcePage": number, "tags": string[], "confidence": number }],
  "questions": []
}`;

const SYSTEM_PROMPTS = {
  NOTES: NOTES_SYSTEM_PROMPT,
  OVERVIEW: OVERVIEW_SYSTEM_PROMPT,
  LAB: LAB_SYSTEM_PROMPT,
} as const;

export async function extractStructuredContent(
  settings: AiSettings,
  pages: ExtractedPage[],
  category: keyof typeof SYSTEM_PROMPTS = "NOTES"
): Promise<ExtractionResult> {
  const system = SYSTEM_PROMPTS[category];
  const total = pages.reduce((sum, p) => sum + pageBlock(p).length, 0);

  // Most course files are a single lecture and fit comfortably. Keep them on
  // the original one-request path: no outline call, no merging, nothing new to
  // go wrong for the common case.
  if (total <= CHUNK_CHARS) {
    const body = joinPages(pages);
    // Routed on the document's own text: a derivation-heavy deck earns the
    // reasoning model, a syllabus does not.
    return extractionSchema.parse(
      await chatJSON({ ...settings, model: pickModel(settings, "content", body) }, system, body)
    );
  }

  const outline = await deriveOutline(settings, pages);
  const chunks = planChunks(pages, outline);
  const allTitles = outline.map((s) => s.title.trim()).filter(Boolean);

  const results: ExtractionResult[] = [];
  const summaries: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const user = buildChunkPrompt(chunk, allTitles, index, chunks.length);
    // One failed part should cost that part, not the document: a 44-page bank
    // is worth far more partially extracted than not at all.
    try {
      const parsed = extractionSchema.parse(
        await chatJSON({ ...settings, model: pickModel(settings, "content", user) }, system, user)
      );
      results.push(parsed);
      if (parsed.summary) summaries.push(parsed.summary);
    } catch (err) {
      console.error(`[extract] 第 ${index + 1}/${chunks.length} 部分解析失败:`, err);
    }
  }

  if (results.length === 0) {
    throw new Error(`文档分为 ${chunks.length} 部分解析，但全部失败`);
  }

  return {
    ...mergeResults(results),
    summary: await mergeSummaries(settings, summaries),
  };
}
