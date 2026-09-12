import { z } from "zod";
import { chatJSON } from "./provider";
import { pickModel } from "./routing";
import type { AiSettings } from "./types";

// Same citation shape as chapter notes: every claim points back at the page it
// came from, which matters more here than anywhere else — a brief that gets a
// weighting or a deadline wrong is worse than no brief.
export type BriefCitation = {
  materialId: string;
  materialName: string;
  sourcePage: number | null;
};

export type AssignmentBrief = {
  version: 1;
  summary: string;
  sections: { heading: string; bullets: { text: string; sources: BriefCitation[] }[] }[];
};

const briefSchema = z.object({
  summary: z.string(),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        bullets: z
          .array(
            z.union([
              z.string().transform((text) => ({ text, sources: [] as number[] })),
              z.object({
                text: z.string(),
                sources: z
                  .array(z.number().int())
                  .nullable()
                  .optional()
                  .transform((v) => v ?? []),
              }),
            ])
          )
          .nullable()
          .optional()
          .transform((v) => v ?? []),
      })
    )
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});

const SYSTEM_PROMPT = `You brief a student on one piece of assessed work in their course, from the course's own documents.

You are given the item's name and due date, then a numbered list of excerpts from the course material. The excerpts come from different documents: the assignment's own page, the guidelines or rubric that govern a whole family of assignments, and the course outline or schedule. They are numbered so you can cite them.

Write the brief in Chinese. Keep in English, exactly as the source writes them, the course's own terminology and proper nouns (Field Notes Journal, SSA, rubric, Learn, D2L), assignment names and part labels, and anything quoted from a requirement.

Structure it so the work itself comes first and the surrounding conditions after:
1. "summary": one or two sentences — what this piece of work actually asks the student to do.
2. Then sections, in this order, omitting any the sources do not cover:
   - 要做什么 — the task itself, step by step. This is the substance and should be the longest section.
   - 提交要求 — what to hand in, in what form, where, length/format limits.
   - 评分标准 — how it is marked: the rubric's criteria and their weights, and what this item is worth in the course.
   - 时间与政策 — due date, late policy, resubmission, group vs individual.
   - 注意事项 — only genuine pitfalls or requirements that are easy to miss, stated in the sources. Omit rather than pad.

Rules:
- Ground every bullet in the excerpts. Do not invent requirements, weights, dates or policies that are not there, and do not generalise from how such work usually goes.
- Each bullet is one short line, specific. Quote exact figures, weights and word limits rather than paraphrasing them ("占课程 5%", "300–500 words").
- Every bullet MUST be an object with "text" and a "sources" array of the 1-based excerpt numbers it came from. A bullet with no source is not usable.
- Where the excerpts disagree, say so and cite both rather than picking one.
- Write formulas and symbols as LaTeX in dollars if any appear.

Return JSON matching this shape exactly:
{ "summary": string, "sections": [{ "heading": string, "bullets": [{ "text": string, "sources": number[] }] }] }`;

export type BriefExcerpt = {
  materialId: string;
  materialName: string;
  sourcePage: number | null;
  /** How this document relates to the item — told to the model as a label. */
  role: string;
  text: string;
};

export async function generateAssignmentBrief(
  settings: AiSettings,
  item: { title: string; kind: string; dueLabel: string },
  excerpts: BriefExcerpt[]
): Promise<AssignmentBrief> {
  if (excerpts.length === 0) {
    throw new Error("没有找到与这项作业相关的课程资料");
  }

  const user = `Item: ${item.title}\nType: ${item.kind}\nDue: ${item.dueLabel}\n\nExcerpts:\n${excerpts
    .map(
      (e, i) =>
        `[${i + 1}] (${e.role} — ${e.materialName}${e.sourcePage != null ? `, p.${e.sourcePage}` : ""})\n${e.text}`
    )
    .join("\n\n")}`;

  const parsed = briefSchema.parse(
    await chatJSON({ ...settings, model: pickModel(settings, "content", user) }, SYSTEM_PROMPT, user)
  );

  return {
    version: 1,
    summary: parsed.summary,
    sections: parsed.sections.map((section) => ({
      heading: section.heading,
      bullets: section.bullets.map((bullet) => ({
        text: bullet.text,
        // Out-of-range indices are dropped rather than throwing: a citation
        // the model invented should cost that citation, not the brief.
        sources: bullet.sources
          .map((n) => excerpts[n - 1])
          .filter(Boolean)
          .map((e) => ({
            materialId: e.materialId,
            materialName: e.materialName,
            sourcePage: e.sourcePage,
          })),
      })),
    })),
  };
}
