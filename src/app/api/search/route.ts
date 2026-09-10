import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Phase 1 keyword search: SQLite LIKE across titles/content/stems. No
// semantic search yet — pgvector comes with the Postgres migration later.
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ materials: [], knowledgePoints: [], questions: [] });

  const [materials, knowledgePoints, questions] = await Promise.all([
    prisma.material.findMany({
      where: { filename: { contains: q } },
      include: { subject: true, course: true, chapter: true },
      take: 20,
    }),
    prisma.knowledgePoint.findMany({
      where: { OR: [{ title: { contains: q } }, { content: { contains: q } }, { tags: { contains: q } }] },
      include: { material: true },
      take: 30,
    }),
    prisma.question.findMany({
      where: { OR: [{ stem: { contains: q } }, { answer: { contains: q } }, { explanation: { contains: q } }] },
      include: { material: true },
      take: 30,
    }),
  ]);

  return NextResponse.json({ materials, knowledgePoints, questions });
}
