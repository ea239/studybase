import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { unlink } from "fs/promises";
import { absoluteUploadPath } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      subject: true,
      course: true,
      chapter: true,
      pages: { orderBy: { pageNumber: "asc" } },
      knowledgePoints: { orderBy: { sourcePage: "asc" } },
      questions: { orderBy: { sourcePage: "asc" } },
    },
  });
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(material);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const key of ["subjectId", "courseId", "chapterId"] as const) {
    if (key in body) data[key] = body[key] || null;
  }
  const material = await prisma.material.update({ where: { id }, data });
  return NextResponse.json(material);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.material.delete({ where: { id } }); // cascades pages/knowledgePoints/questions
  try {
    await unlink(absoluteUploadPath(material.storagePath));
  } catch {
    // file already gone — not fatal, the DB row is the source of truth for existence
  }
  return NextResponse.json({ ok: true });
}
