import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * One page of a document as it was extracted.
 *
 * Backs the source viewer for material that has no page image to show — an
 * uploaded web page has no pages to render, but it does have the text a claim
 * was drawn from, which is the point of following a citation.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  const { id, page } = await params;
  const pageNumber = Number(page);
  if (!Number.isInteger(pageNumber)) {
    return NextResponse.json({ error: "invalid page" }, { status: 400 });
  }

  const material = await prisma.material.findUnique({
    where: { id },
    select: { filename: true, fileType: true, pages: { select: { pageNumber: true } } },
  });
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });

  const content = await prisma.materialPage.findFirst({
    where: { materialId: id, pageNumber },
    select: { rawText: true },
  });

  return NextResponse.json({
    filename: material.filename,
    fileType: material.fileType,
    pageNumber,
    totalPages: material.pages.length,
    // Present for every type; the viewer prefers the rendered image where
    // there is one and falls back to this.
    rawText: content?.rawText ?? null,
  });
}
