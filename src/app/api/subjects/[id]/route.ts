import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Subject-level aggregate: everything needed to render the lecture outline,
// exercises, lab summaries, and overview/grading info in one call. Also the
// shape a future GPT plugin/MCP tool would use to answer "what's in ECE 356".
// A Subject is a single course — there is no separate course grouping layer.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subject = await prisma.subject.findUnique({
    where: { id },
    include: {
      chapters: { orderBy: { order: "asc" } },
      materials: {
        orderBy: { createdAt: "asc" },
        include: {
          knowledgePoints: { orderBy: { sourcePage: "asc" } },
          questions: { orderBy: { sourcePage: "asc" } },
        },
      },
    },
  });
  if (!subject) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(subject);
}
