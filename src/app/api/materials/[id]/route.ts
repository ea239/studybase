import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteMaterialFiles } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      subject: true,
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
  for (const key of ["subjectId", "chapterId"] as const) {
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
  await deleteMaterialFiles(material.id, material.storagePath);
  return NextResponse.json({ ok: true });
}
