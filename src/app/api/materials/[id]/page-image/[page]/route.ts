import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renderPdfPage } from "@/lib/pdf-images";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  const { id, page } = await params;
  const pageNumber = Number(page);

  const material = await prisma.material.findUnique({
    where: { id },
    select: { storagePath: true, fileType: true },
  });
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (material.fileType !== "PDF") {
    return NextResponse.json({ error: "only PDF pages can be rendered" }, { status: 400 });
  }

  const png = await renderPdfPage(id, material.storagePath, pageNumber);
  if (!png) return NextResponse.json({ error: "render failed" }, { status: 404 });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Cached on disk and derived from an immutable upload, so it's safe to
      // let the browser hold on to it too.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
