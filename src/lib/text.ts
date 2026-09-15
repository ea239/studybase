import type { ExtractedPage } from "@/lib/pdf";

// Plain text has no pages, but citations point at one, and "page 1 of a 40-page
// transcript" locates nothing. Splitting on a rough size gives a citation
// somewhere to land — small enough to be a useful pointer, large enough that a
// paragraph is rarely torn in half.
const PAGE_CHARS = 2500;

/**
 * Splits a text file into pages at paragraph boundaries.
 *
 * Never mid-paragraph: a citation whose page starts halfway through a sentence
 * reads as corruption, and the point of following one is to see the passage
 * whole.
 */
export function extractTextPages(buffer: Buffer): ExtractedPage[] {
  const content = buffer.toString("utf8").replace(/\r\n/g, "\n").trim();
  if (!content) return [];

  const paragraphs = content.split(/\n{2,}/);
  const pages: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > PAGE_CHARS) {
      pages.push(current);
      current = "";
    }
    // A single paragraph longer than a page is split on lines rather than
    // being allowed to make one enormous page.
    if (paragraph.length > PAGE_CHARS) {
      for (const line of paragraph.split("\n")) {
        if (current && current.length + line.length + 1 > PAGE_CHARS) {
          pages.push(current);
          current = "";
        }
        current += (current ? "\n" : "") + line;
      }
      continue;
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  if (current) pages.push(current);

  return pages.map((text, i) => ({ pageNumber: i + 1, text }));
}
