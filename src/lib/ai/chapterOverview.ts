import { z } from "zod";
import { chatJSON } from "./provider";
import type { AiSettings } from "./types";

export type ChapterOverviewCitation = {
  materialId: string;
  materialName: string;
  sourcePage: number | null;
};

export type Bilingual = { en: string; zh: string };

export type NoteBullet = {
  text: Bilingual;
  sources: ChapterOverviewCitation[];
  // Set by the model when seeing the source slide genuinely helps — a diagram,
  // timing chart or layout. Absent on notes generated before this existed.
  figure?: boolean;
};

export type NoteSection = {
  heading: Bilingual;
  bullets: NoteBullet[];
};

// version 2 = note-style bilingual sections. Version 1 was a single-language
// array of prose paragraphs; it is not migrated — those chapters just show as
// "not generated yet" until regenerated.
export type ChapterOverviewContent = {
  version: 2;
  sections: NoteSection[];
};

// Smaller models routinely flatten a bullet to a bare string instead of the
// requested {text, sources} object. Accepting both keeps the whole chapter
// from being thrown away over a shape the model simplified — the only loss is
// that such a bullet carries no citations.
const bulletSchema = z.union([
  z.string().transform((text) => ({ text, sources: [] as number[], figure: false })),
  z.object({
    text: z.string(),
    sources: z
      .array(z.number().int())
      .nullable()
      .optional()
      .transform((v) => v ?? []),
    figure: z
      .boolean()
      .nullable()
      .optional()
      .transform((v) => v ?? false),
  }),
]);

const notesSchema = z.object({
  sections: z.array(
    z.object({
      heading: z.string(),
      bullets: z.array(bulletSchema),
    })
  ),
});

const translationSchema = z.object({ lines: z.array(z.string()) });

const NOTES_PROMPT = `You are a student's study-notes assistant. You turn a chapter's raw knowledge points into concise revision notes.

You will be given a chapter name and a numbered list of knowledge points (title + content) extracted from the student's course material.

Write NOTES, not an essay. Rules:
- Group the material into 2-5 short thematic sections, ordered the way a student should learn them.
- Each section has a short heading (a few words) and 2-5 bullets.
- Each bullet is ONE short line — a definition, a contrast, a rule, a formula, a concrete example. Telegraphic style. Aim for under 20 words per bullet. No filler, no "In this chapter we will see that...", no restating the heading, no full-sentence padding.
- Prefer "X = Y", "X vs Y", "A → B" style phrasing where it fits. Keep it scannable.
- Do not invent content that is not in the source knowledge points.
- Write in English.

Every bullet MUST be an object with a "text" string and a "sources" array listing the 1-based number(s) of the input knowledge point(s) it came from. Never write a bullet as a bare string — without "sources" the note loses its link back to the source page.

Each bullet also needs a "figure" boolean. The app can show the original slide next to a bullet, so set "figure": true ONLY where seeing the slide genuinely adds something words can't:
- a diagram, timing/sequence chart, protocol exchange, packet/header layout, topology, state machine, or worked numeric example
- a mechanism whose moving parts are hard to follow as a sentence
Set "figure": false for definitions, term lists, comparisons, rules of thumb, and anything already fully expressed by the bullet text. Most bullets should be false — expect at most 1-2 true per section. A wall of slides is worse than none.

Return JSON matching this shape exactly:
{ "sections": [{ "heading": string, "bullets": [{ "text": string, "sources": number[], "figure": boolean }] }] }`;

const TRANSLATE_PROMPT = `You translate study notes from English to Chinese.

You will receive a JSON array of English lines (section headings and bullets from a student's revision notes). Translate each line and return them in the SAME order and the SAME count.

A Chinese speaker must be able to read your translation and understand the point without knowing English. Translate into Chinese: all verbs, adjectives, connectives, common nouns, descriptions, and any list of ordinary concepts.

Keep in English ONLY, exactly as written in the source: named technical terms the course uses as terminology (e.g. schema, DBMS, B+ tree, physical schema, TCP), proper nouns and product names (MySQL, Ubuntu), and commands/code/identifiers.

Never leave a whole clause or a comma-separated list of plain descriptions untranslated. Examples:
- BAD:  "File systems 缺点：data redundancy, inconsistency, no integrity enforcement"
  GOOD: "File system 的缺点：数据冗余、数据不一致、无法强制保证 data integrity"
- BAD:  "三个 Levels of Abstraction：Physical level (how stored), Logical level (structure)"
  GOOD: "三层抽象：Physical level（数据怎么存）、Logical level（数据结构）"

Return JSON matching this shape exactly, with exactly as many lines as you received:
{ "lines": [string] }`;

type EnglishNotes = z.infer<typeof notesSchema>;

async function writeEnglishNotes(
  settings: AiSettings,
  chapterName: string,
  points: { title: string; content: string }[]
): Promise<EnglishNotes> {
  const user = `Chapter: ${chapterName}\n\nKnowledge points:\n${points
    .map((p, i) => `${i + 1}. ${p.title}\n${p.content}`)
    .join("\n\n")}`;
  return notesSchema.parse(await chatJSON(settings, NOTES_PROMPT, user));
}

// Translation is mechanical, so it runs on `translateModel` when one is set —
// typically a much cheaper model than the one that wrote the notes.
async function translateLines(settings: AiSettings, lines: string[]): Promise<string[]> {
  if (lines.length === 0) return [];
  const translateSettings: AiSettings = { ...settings, model: settings.translateModel || settings.model };
  try {
    const raw = await chatJSON(translateSettings, TRANSLATE_PROMPT, JSON.stringify(lines, null, 2));
    const parsed = translationSchema.parse(raw);
    // A short/long response would silently misalign headings and bullets, so
    // fall back to the English text for anything the model didn't return.
    return lines.map((line, i) => parsed.lines[i] ?? line);
  } catch (err) {
    // The notes are already written at this point — losing them because the
    // (often different, cheaper) translation model failed would be worse than
    // shipping English-only notes the user can re-translate later.
    console.error("[chapter-notes] 翻译失败，保留英文原文:", err);
    return lines;
  }
}

export async function generateChapterOverview(
  settings: AiSettings,
  chapterName: string,
  points: { title: string; content: string; materialId: string; materialName: string; sourcePage: number | null }[]
): Promise<ChapterOverviewContent> {
  if (points.length === 0) {
    throw new Error("no knowledge points to summarize");
  }

  const notes = await writeEnglishNotes(settings, chapterName, points);

  // Flatten to a single ordered list so the whole chapter is translated in one
  // request, then map the results back onto their headings/bullets.
  const flat: string[] = [];
  for (const section of notes.sections) {
    flat.push(section.heading);
    for (const b of section.bullets) flat.push(b.text);
  }
  const translated = await translateLines(settings, flat);

  const resolve = (indexes: number[]): ChapterOverviewCitation[] =>
    indexes
      .map((i) => points[i - 1])
      .filter((p): p is (typeof points)[number] => p != null)
      .map((p) => ({ materialId: p.materialId, materialName: p.materialName, sourcePage: p.sourcePage }));

  let cursor = 0;
  return {
    version: 2,
    sections: notes.sections.map((section) => {
      const heading = { en: section.heading, zh: translated[cursor++] };
      const bullets = section.bullets.map((b) => ({
        text: { en: b.text, zh: translated[cursor++] },
        sources: resolve(b.sources),
        figure: b.figure,
      }));
      return { heading, bullets };
    }),
  };
}
