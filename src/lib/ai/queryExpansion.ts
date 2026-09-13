import { z } from "zod";
import { chatJSON } from "./provider";
import type { AiSettings } from "./types";

const expansionSchema = z.object({
  terms: z
    .array(z.string())
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});

const SYSTEM_PROMPT = `You turn a student's question about their course into the words to search that course's documents for.

You are given the question and a catalogue of the course: its chapters, its assignments and exams with dates, and its file names. Return the search terms most likely to appear in the documents that answer the question.

- Give terms in BOTH English and Chinese, whatever the question was asked in. Course documents are usually written in English while the question often is not, so a Chinese-only term list finds nothing.
- Resolve references against the catalogue. "第一项作业" or "the first assignment" is not a phrase any document contains — look up which item that is and return its actual name ("PD0"). Same for "下一个 quiz", "最后一章", "上周的 lab".
- Expand to the words a document would really use: synonyms, the full form of an abbreviation and the abbreviation itself, the topic a concept belongs to.
- Include the question's own distinctive words too, unchanged.
- Single words and short phrases, not sentences. At most 12, most useful first. No stop words.

Return JSON matching this shape exactly:
{ "terms": [string] }`;

/**
 * Widens a question into terms the documents might actually contain.
 *
 * Keyword search fails on this class of question twice over: a Chinese
 * question never matches English slides, and "the first assignment" appears
 * nowhere in a course whose first assignment is called PD0. Both are fixed by
 * asking what to search for before searching.
 *
 * Failure is not fatal — search falls back to the question's own words, which
 * is what it did before.
 */
export async function expandQuery(
  settings: AiSettings,
  query: string,
  catalogue: string
): Promise<string[]> {
  try {
    const raw = await chatJSON(
      // The cheap model: this is a vocabulary lookup, not reasoning, and it
      // sits in front of every search.
      { ...settings, model: settings.translateModel?.trim() || settings.model },
      SYSTEM_PROMPT,
      `Question: ${query}\n\nCourse catalogue:\n${catalogue}`
    );
    return expansionSchema
      .parse(raw)
      .terms.map((t) => t.trim())
      .filter((t) => t.length > 1)
      .slice(0, 12);
  } catch (err) {
    console.error("[search] 查询扩写失败，改用原始关键词:", err);
    return [];
  }
}
