import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { officePdfBuffer } from "@/lib/office";
import { imageMimeOf } from "@/lib/fileTypes";

// Serves the original, unmodified file — this is the ground truth users can
// always fall back to, separate from any AI-extracted content.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });

  // A browser cannot display a .ppt, so the preview shows the PDF it was
  // converted to. `?original=1` still serves the file exactly as uploaded,
  // which is what the download link asks for.
  const wantsOriginal = new URL(_req.url).searchParams.get("original") === "1";
  const asPdf = material.fileType === "OFFICE" && !wantsOriginal;

  const buffer = asPdf
    ? await officePdfBuffer(material.id, material.storagePath)
    : await readUpload(material.storagePath);
  const isHtml = material.fileType === "HTML";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": isHtml
        ? "text/html; charset=utf-8"
        : material.fileType === "TEXT"
          ? "text/plain; charset=utf-8"
          : material.fileType === "IMAGE"
            ? imageMimeOf(material.filename)
            : material.fileType === "OFFICE" && wantsOriginal
              ? "application/octet-stream"
              : "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(material.filename)}"`,
      // Uploaded HTML is untrusted content — sandbox it so any embedded
      // script can't run in this app's origin when viewed inline.
      ...(isHtml ? { "Content-Security-Policy": "sandbox; default-src 'self'" } : {}),
    },
  });
}
