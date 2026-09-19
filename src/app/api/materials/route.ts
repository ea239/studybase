import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import { enqueueProcessMaterial } from "@/lib/pipeline";
import { materialTypeOf } from "@/lib/fileTypes";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId") ?? undefined;
  const chapterId = searchParams.get("chapterId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  // Used to poll one upload batch regardless of the list's current filters.
  const ids = searchParams.get("ids")?.split(",").filter(Boolean);

  const materials = await prisma.material.findMany({
    where: {
      id: ids?.length ? { in: ids } : undefined,
      subjectId: subjectId || undefined,
      chapterId: chapterId || undefined,
      status: (status as never) || undefined,
      category: (category as never) || undefined,
    },
    orderBy: { createdAt: "desc" },
    include: {
      subject: true,
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
  const fileType = materialTypeOf(file.name);
  if (!fileType) {
    return NextResponse.json(
      { error: "支持 PDF、HTML 网页、PPT / Word 文档、纯文本（txt/md/csv）和图片（png/jpg 等），其他格式暂不支持" },
      { status: 400 }
    );
  }

  const subjectId = (form.get("subjectId") as string | null) || null;
  const chapterId = (form.get("chapterId") as string | null) || null;
  const categoryRaw = (form.get("category") as string | null) || "NOTES";
  const category = categoryRaw === "OVERVIEW" || categoryRaw === "LAB" ? categoryRaw : "NOTES";

  const material = await prisma.material.create({
    data: {
      filename: file.name,
      storagePath: "", // filled in right after, once we have the material id
      fileType,
      category,
      status: "PENDING",
      subjectId,
      chapterId,
    },
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = await saveUpload(material.id, file.name, buffer);
  await prisma.material.update({ where: { id: material.id }, data: { storagePath } });

  // Fire-and-forget onto the in-process serial queue, so a batch upload gets
  // parsed one file at a time. The client polls GET /api/materials for status.
  void enqueueProcessMaterial(material.id);

  return NextResponse.json(material, { status: 201 });
}
