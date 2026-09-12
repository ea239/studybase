import { z } from "zod";
import { chatJSON } from "./provider";
import type { AiSettings } from "./types";

// The course's administrative facts, as a student would want them at a glance.
// Kept deliberately small: this is the tile you read in two seconds, not the
// outline itself.
const factsSchema = z.object({
  facts: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});

export type CourseFact = { label: string; value: string };
export type CourseFacts = { version: 1; facts: CourseFact[] };

const SYSTEM_PROMPT = `You pull a course's key administrative facts out of its own documents, for a panel a student glances at.

You are given excerpts from a course's outline, syllabus and schedule. Return the handful of facts worth seeing at a glance, at most 8, most useful first: instructor, term, lecture times and place, grading breakdown, exam dates, late policy, textbook, contact.

Rules:
- "label" is 2-6 characters of Chinese naming the fact (讲师, 学期, 上课时间, 成绩构成, 期末, 迟交政策, 教材).
- "value" is short and scannable — a phrase, not a sentence. Cut anything the label already says.
- Write every date and time in numerals, never in words: "9月11日 23:59", not "September 11". Use 月/日 and a 24-hour clock. Ranges as "10月26日–10月30日".
- Keep course terminology, proper nouns and codes in English exactly as written (Turnitin, D2L, ECE 358, MW 10:00–11:20).
- A grading breakdown belongs on one line as components with weights: "Labs 30% · Midterm 25% · Final 45%".
- Use only what the excerpts state. Omit a fact rather than guessing it, and never invent a policy the documents do not give.
- If the excerpts contain none of this, return an empty array.

Return JSON matching this shape exactly:
{ "facts": [{ "label": string, "value": string }] }`;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Rewrites English month names as numerals.
 *
 * The prompt asks for this, and the model mostly obliges — "mostly" being the
 * problem. A formatting rule that must hold every time is cheaper to enforce
 * than to ask for, and the input here is narrow enough to do it exactly.
 */
function numeralDates(value: string): string {
  const names = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

  return (
    value
      // "December 10-23" / "Dec 10–23" -> "12月10日–12月23日"
      .replace(
        new RegExp(`\\b(${names})[a-z]*\\.?\\s+(\\d{1,2})\\s*[–—-]\\s*(\\d{1,2})\\b`, "gi"),
        (_m, month: string, from: string, to: string) => {
          const n = MONTHS[month.toLowerCase()];
          return `${n}月${Number(from)}日–${n}月${Number(to)}日`;
        }
      )
      // "September 11, 2026" / "Sep 11" -> "9月11日"
      .replace(
        new RegExp(`\\b(${names})[a-z]*\\.?\\s+(\\d{1,2})(?:\\s*,\\s*\\d{4})?\\b`, "gi"),
        (_m, month: string, day: string) => `${MONTHS[month.toLowerCase()]}月${Number(day)}日`
      )
      // "11 September" -> "9月11日"
      .replace(
        new RegExp(`\\b(\\d{1,2})\\s+(${names})[a-z]*\\.?\\b`, "gi"),
        (_m, day: string, month: string) => `${MONTHS[month.toLowerCase()]}月${Number(day)}日`
      )
  );
}

export async function extractCourseFacts(
  settings: AiSettings,
  subjectName: string,
  excerpts: { materialName: string; text: string }[]
): Promise<CourseFacts> {
  if (excerpts.length === 0) return { version: 1, facts: [] };

  const user = `Course: ${subjectName}\n\nExcerpts:\n${excerpts
    .map((e, i) => `[${i + 1}] (${e.materialName})\n${e.text}`)
    .join("\n\n")}`;

  const parsed = factsSchema.parse(await chatJSON(settings, SYSTEM_PROMPT, user));
  return {
    version: 1,
    facts: parsed.facts
      .map((f) => ({ label: f.label.trim(), value: numeralDates(f.value.trim()) }))
      .filter((f) => f.label && f.value)
      .slice(0, 8),
  };
}
