import { z } from "zod";
import { chatJSON } from "./provider";
import type { AiSettings } from "./types";

// Course documents state dates with very different certainty. A lab sheet
// gives a fixed instant; a syllabus often gives a window the registrar has not
// resolved yet ("Final Exam Period: December 10-23rd"). Putting the second on
// a calendar day would invent a precision the course never offered, so the
// model is asked to classify rather than to guess a date.
const eventSchema = z.object({
  events: z
    .array(
      z.object({
        title: z.string(),
        kind: z.enum(["LAB", "ASSIGNMENT", "EXAM", "OTHER"]).nullable().optional(),
        precision: z.enum(["EXACT", "RANGE", "UNKNOWN"]).nullable().optional(),
        // ISO 8601 local time, e.g. "2026-09-25T23:59".
        startsAt: z.string().nullable().optional(),
        endsAt: z.string().nullable().optional(),
        approxLabel: z.string().nullable().optional(),
        sourceIndex: z.number().int().nullable().optional(),
      })
    )
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});

const SYSTEM_PROMPT = `You extract dated items from a university course's own documents: lab due dates, assignment deadlines, midterms, finals, and similar.

You are given the course name, the current date (to resolve a year the text leaves out), and a numbered list of extracted facts about schedules and deadlines.

For each dated item, decide how precisely the source actually fixes it:
- "EXACT" — the source names one specific day (a due date, a single exam day). Put that day in "startsAt" as ISO 8601 local time. Use the stated time of day if given ("11:59pm" -> T23:59); otherwise T23:59 for a deadline, T00:00 otherwise.
- "RANGE" — the source names a window rather than a day, e.g. "October 26-30th", "Final Exam Period: December 10-23rd", "during reading week". Set "startsAt" and "endsAt" to the window's first and last day. This is NOT a fixed date: a midterm week is a period inside which the real date is not yet announced.
- "UNKNOWN" — the item is named but no date is given ("Final exam: TBD", "date to be announced"). Leave the dates null and put the source's own wording in "approxLabel".

Rules:
- One event per item. Do not merge a lab and its exam, or invent items the text does not state.
- The year is often omitted. Resolve it from the current date and the course's term, and never emit a date more than a year away from the current date.
- "kind" describes what the student has to do:
  - LAB — labs and lab reports.
  - ASSIGNMENT — anything else with something to hand in or take part in for credit: assignments, homework, projects, essays, reports, PD deliverables, journals, portfolios, presentations, and graded discussions or participation posts.
  - EXAM — midterms, finals, quizzes, tests.
  - OTHER — only dates with nothing to submit or sit: term start and end, reading week, a schedule being published, a holiday. If the student has to do something by that date, it is never OTHER.
- "title" should be short and recognisable on a calendar ("Lab 2 截止", "Midterm"). Keep the course's own numbering.
- Skip recurring class meetings — weekly lectures, tutorials and office hours are not events.
- "sourceIndex" is the 1-based number of the input fact the event came from.
- If no input fact states a date or a dateable item, return an empty array.

Return JSON matching this shape exactly:
{ "events": [{ "title": string, "kind": "LAB"|"ASSIGNMENT"|"EXAM"|"OTHER", "precision": "EXACT"|"RANGE"|"UNKNOWN", "startsAt": string|null, "endsAt": string|null, "approxLabel": string|null, "sourceIndex": number }] }`;

export type ExtractedEvent = {
  title: string;
  kind: "LAB" | "ASSIGNMENT" | "EXAM" | "OTHER";
  precision: "EXACT" | "RANGE" | "UNKNOWN";
  startsAt: Date | null;
  endsAt: Date | null;
  approxLabel: string | null;
  sourcePage: number | null;
};

// A date the model invents wildly (a typo'd year, say) would sit alone on a
// calendar years away, so anything outside a sane window is rejected.
const MAX_AHEAD_MS = 400 * 24 * 60 * 60 * 1000;
const MAX_BEHIND_MS = 200 * 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined, now: Date): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const delta = parsed.getTime() - now.getTime();
  if (delta > MAX_AHEAD_MS || delta < -MAX_BEHIND_MS) return null;
  return parsed;
}

export async function extractCourseEvents(
  settings: AiSettings,
  subjectName: string,
  facts: { title: string; content: string; sourcePage: number | null }[]
): Promise<ExtractedEvent[]> {
  if (facts.length === 0) return [];

  const now = new Date();
  const user = `Course: ${subjectName}\nCurrent date: ${now.toISOString().slice(0, 10)}\n\nFacts:\n${facts
    .map((f, i) => `${i + 1}. ${f.title}\n${f.content}`)
    .join("\n\n")}`;

  // Deliberately not routed to the reasoning model: reading a date out of a
  // sentence is transcription, and a syllabus full of numbers would otherwise
  // trip the maths heuristic for no benefit.
  const parsed = eventSchema.parse(await chatJSON(settings, SYSTEM_PROMPT, user));

  const events: ExtractedEvent[] = [];
  for (const raw of parsed.events) {
    const title = raw.title?.trim();
    if (!title) continue;

    const startsAt = parseDate(raw.startsAt, now);
    const endsAt = parseDate(raw.endsAt, now);

    // Trust the dates over the label: a model that says EXACT but gives no
    // usable date has not fixed anything, and an end date means a window.
    let precision: ExtractedEvent["precision"] = raw.precision ?? "UNKNOWN";
    if (!startsAt) precision = "UNKNOWN";
    else if (endsAt && endsAt.getTime() > startsAt.getTime()) precision = "RANGE";
    else if (precision === "RANGE") precision = "EXACT";

    const source = raw.sourceIndex != null ? facts[raw.sourceIndex - 1] : undefined;

    events.push({
      title,
      kind: raw.kind ?? "OTHER",
      precision,
      startsAt: precision === "UNKNOWN" ? null : startsAt,
      endsAt: precision === "RANGE" ? endsAt : null,
      approxLabel: raw.approxLabel?.trim() || null,
      sourcePage: source?.sourcePage ?? null,
    });
  }
  return events;
}
