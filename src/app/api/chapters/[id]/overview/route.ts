import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai/settings";
import { generateChapterOverview } from "@/lib/ai/chapterOverview";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const chapter = await prisma.chapter.findUnique({
    where: { id },
    include: {
      knowledgePoints: {
        orderBy: { sourcePage: "asc" },
        include: { material: { select: { id: true, filename: true } } },
      },
    },
  });
  if (!chapter) return NextResponse.json({ error: "chapter not found" }, { status: 404 });

  if (chapter.knowledgePoints.length === 0) {
    return NextResponse.json({ error: "本章还没有知识点，无法生成讲解" }, { status: 400 });
  }

  const settings = await getAiSettings();
  if (!settings) {
    return NextResponse.json({ error: "请先在设置页配置 AI" }, { status: 400 });
  }

  let overview;
  try {
    overview = await generateChapterOverview(
      settings,
      chapter.name,
      chapter.knowledgePoints.map((p) => ({
        title: p.title,
        content: p.content,
        materialId: p.material.id,
        materialName: p.material.filename,
        sourcePage: p.sourcePage,
      }))
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const updated = await prisma.chapter.update({
    where: { id },
    data: { overview: JSON.stringify(overview), overviewGeneratedAt: new Date() },
  });

  return NextResponse.json({ overview, overviewGeneratedAt: updated.overviewGeneratedAt });
}
