import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteSubject, describeSubjectDeletion } from "@/lib/subjects";

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


/** What would be removed, so the confirmation can say it rather than guess. */
export async function OPTIONS(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = await describeSubjectDeletion(id);
  if (!summary) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(summary);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const subject = await prisma.subject.findUnique({ where: { id }, select: { name: true } });
  if (!subject) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The caller must name the course it means to delete. This is unrecoverable
  // and removes files as well as rows, so a mis-click or a stale page should
  // not be able to trigger it.
  const { confirm } = await req.json().catch(() => ({}));
  if (typeof confirm !== "string" || confirm.trim() !== subject.name) {
    return NextResponse.json(
      { error: `请输入课程名「${subject.name}」以确认删除` },
      { status: 400 }
    );
  }

  const summary = await deleteSubject(id);
  return NextResponse.json({ ok: true, deleted: summary });
}
