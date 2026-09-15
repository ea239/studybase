import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { officePdfRelativePath } from "@/lib/office";
import { imageMimeOf } from "@/lib/fileTypes";
import { readUpload } from "@/lib/storage";
import { renderPdfPage } from "@/lib/pdf-images";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  const { id, page } = await params;
  const pageNumber = Number(page);

  const material = await prisma.material.findUnique({
    where: { id },
    select: { storagePath: true, fileType: true, filename: true },
  });
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (material.fileType === "IMAGE") {
    // The upload is the page. Nothing to render.
    const bytes = await readUpload(material.storagePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": imageMimeOf(material.filename),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (material.fileType === "HTML" || material.fileType === "TEXT") {
    return NextResponse.json({ error: "this material has no page image" }, { status: 400 });
  }

  // An Office document's figures come from the PDF it was converted to, which
  // is the document that was actually parsed and cited.
  const pdfPath =
    material.fileType === "OFFICE"
      ? await officePdfRelativePath(id, material.storagePath)
      : material.storagePath;

  const png = await renderPdfPage(id, pdfPath, pageNumber);
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
