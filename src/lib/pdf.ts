import { PDFParse } from "pdf-parse";

export type ExtractedPage = { pageNumber: number; text: string };

export async function extractPdfPages(buffer: Buffer): Promise<ExtractedPage[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => ({ pageNumber: p.num, text: p.text }));
  } finally {
    await parser.destroy();
  }
}
