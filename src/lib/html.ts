import * as cheerio from "cheerio";
import type { ExtractedPage } from "./pdf";

// HTML pages have no concept of "pages" — treated as a single page (1) so
// KnowledgePoint/Question.sourcePage stays meaningful for PDFs and is just
// always 1 for HTML sources.
export async function extractHtmlPages(buffer: Buffer): Promise<ExtractedPage[]> {
  const $ = cheerio.load(buffer.toString("utf-8"));
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];
  return [{ pageNumber: 1, text }];
}
