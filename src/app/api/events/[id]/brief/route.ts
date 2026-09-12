import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai/settings";
import { generateAssignmentBrief } from "@/lib/ai/assignmentBrief";
import { gatherAssignmentContext } from "@/lib/assignments";

export const dynamic = "force-dynamic";

/** Writes (or rewrites) the brief for one piece of assessed work. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const event = await prisma.courseEvent.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const settings = await getAiSettings();
  if (!settings) return NextResponse.json({ error: "还没有配置 AI 服务" }, { status: 400 });

  try {
    const excerpts = await gatherAssignmentContext({
      id: event.id,
      title: event.title,
      subjectId: event.subjectId,
      materialId: event.materialId,
    });

    const dueLabel = event.startsAt
      ? event.startsAt.toISOString().slice(0, 16).replace("T", " ")
      : (event.approxLabel ?? "未公布");

    const brief = await generateAssignmentBrief(
      settings,
      { title: event.title, kind: event.kind, dueLabel },
      excerpts
    );

    await prisma.courseEvent.update({
      where: { id },
      data: { brief: JSON.stringify(brief), briefGeneratedAt: new Date() },
    });

    return NextResponse.json({ brief, briefGeneratedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
