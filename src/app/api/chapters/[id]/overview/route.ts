import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai/settings";
import { generateChapterOverview } from "@/lib/ai/chapterOverview";
import { isGenerating } from "@/lib/generation";

export const dynamic = "force-dynamic";

/** Whether notes exist, and whether a run is in flight right now. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id },
    select: { overview: true, overviewGeneratedAt: true, overviewStartedAt: true },
  });
  if (!chapter) return NextResponse.json({ error: "chapter not found" }, { status: 404 });

  let overview = null;
  try {
    const parsed = chapter.overview ? JSON.parse(chapter.overview) : null;
    if (parsed?.version === 2 && Array.isArray(parsed.sections)) overview = parsed;
  } catch {
    // An older shape reads as "not generated".
  }

  return NextResponse.json({
    generating: isGenerating(chapter.overviewStartedAt),
    overview,
    overviewGeneratedAt: chapter.overviewGeneratedAt,
  });
}

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

  // A second request while one is in flight would spend the quota twice and
  // race to write the same row. The caller is told it is already happening,
  // which is what it should display anyway.
  if (isGenerating(chapter.overviewStartedAt)) {
    return NextResponse.json({ generating: true }, { status: 409 });
  }

  if (chapter.knowledgePoints.length === 0) {
    return NextResponse.json({ error: "本章还没有知识点，无法生成讲解" }, { status: 400 });
  }

  const settings = await getAiSettings();
  if (!settings) {
    return NextResponse.json({ error: "请先在设置页配置 AI" }, { status: 400 });
  }

  await prisma.chapter.update({ where: { id }, data: { overviewStartedAt: new Date() } });

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
    // Cleared on the way out, or the chapter would claim to be generating
    // until the staleness window expires.
    await prisma.chapter
      .update({ where: { id }, data: { overviewStartedAt: null } })
      .catch(() => {});
    const message = err instanceof Error ? err.message : "生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const updated = await prisma.chapter.update({
    where: { id },
    data: {
      overview: JSON.stringify(overview),
      overviewGeneratedAt: new Date(),
      overviewStartedAt: null,
    },
  });

  return NextResponse.json({ overview, overviewGeneratedAt: updated.overviewGeneratedAt });
}
