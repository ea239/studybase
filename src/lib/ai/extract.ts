import { z } from "zod";
import { chatJSON } from "./provider";
import type { AiSettings } from "./types";
import type { ExtractedPage } from "@/lib/pdf";

const extractionSchema = z.object({
  summary: z.string(),
  knowledgePoints: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      sourcePage: z.number().int().nullable().optional(),
      tags: z.array(z.string()).optional().default([]),
      confidence: z.number().min(0).max(1).optional(),
    })
  ),
  questions: z.array(
    z.object({
      stem: z.string(),
      options: z.array(z.string()).optional(),
      answer: z.string(),
      explanation: z.string().optional(),
      sourcePage: z.number().int().nullable().optional(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional().default("MEDIUM"),
      confidence: z.number().min(0).max(1).optional(),
    })
  ),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

// Phase 1 limitation: pages are concatenated and sent in one request, capped
// at MAX_CHARS. Long materials get truncated rather than chunked — chunking
// with cross-chunk merging is a phase 2 concern once this path is proven.
const MAX_CHARS = 60_000;

function buildPrompt(pages: ExtractedPage[]) {
  let used = 0;
  const parts: string[] = [];
  for (const page of pages) {
    const chunk = `\n--- Page ${page.pageNumber} ---\n${page.text}`;
    if (used + chunk.length > MAX_CHARS) break;
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join("");
}

const SYSTEM_PROMPT = `You are an assistant that turns study material (lecture slides, textbook excerpts, notes) into structured study content.

Given the raw text of a document, page by page, extract:
1. A short summary (2-4 sentences) of what the document covers.
2. Knowledge points: definitions, formulas, key concepts, and worked examples. Each must cite the page number it came from.
3. Questions: any exercises, practice problems, or quiz questions found in the text, with their answer and explanation if present. Each must cite the page number it came from. Do not invent questions that are not in the text — only extract ones that actually appear.

For every knowledge point and question, include a "confidence" score from 0 to 1 reflecting how certain you are about the page number and correctness of the extraction. Use a lower score when the source text is garbled, ambiguous, or you had to infer structure.

Return JSON matching this shape exactly:
{
  "summary": string,
  "knowledgePoints": [{ "title": string, "content": string, "sourcePage": number, "tags": string[], "confidence": number }],
  "questions": [{ "stem": string, "options": string[] | null, "answer": string, "explanation": string, "sourcePage": number, "difficulty": "EASY"|"MEDIUM"|"HARD", "confidence": number }]
}`;

export async function extractStructuredContent(
  settings: AiSettings,
  pages: ExtractedPage[]
): Promise<ExtractionResult> {
  const user = buildPrompt(pages);
  const raw = await chatJSON(settings, SYSTEM_PROMPT, user);
  return extractionSchema.parse(raw);
}
