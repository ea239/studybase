import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import { processMaterial } from "@/lib/pipeline";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId") ?? undefined;
  const courseId = searchParams.get("courseId") ?? undefined;
  const chapterId = searchParams.get("chapterId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const materials = await prisma.material.findMany({
    where: {
      subjectId: subjectId || undefined,
      courseId: courseId || undefined,
      chapterId: chapterId || undefined,
      status: (status as never) || undefined,
    },
    orderBy: { createdAt: "desc" },
    include: {
      subject: true,
      course: true,
      chapter: true,
      _count: { select: { knowledgePoints: true, questions: true, pages: true } },
    },
  });
  return NextResponse.json(materials);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "目前仅支持 PDF，其他格式将在后续阶段支持" },
      { status: 400 }
    );
  }

  const subjectId = (form.get("subjectId") as string | null) || null;
  const courseId = (form.get("courseId") as string | null) || null;
  const chapterId = (form.get("chapterId") as string | null) || null;

  const material = await prisma.material.create({
    data: {
      filename: file.name,
      storagePath: "", // filled in right after, once we have the material id
      fileType: "PDF",
      status: "PENDING",
      subjectId,
      courseId,
      chapterId,
    },
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = await saveUpload(material.id, file.name, buffer);
  await prisma.material.update({ where: { id: material.id }, data: { storagePath } });

  // Fire-and-forget: phase 1 has no job queue, processing runs in-process.
  // The client polls GET /api/materials/[id] for status.
  void processMaterial(material.id);

  return NextResponse.json(material, { status: 201 });
}
