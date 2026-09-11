import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MAX_LIST = 30;

// Recent threads, newest first — scoped to a subject when one is given so the
// dropdown shows what was asked while reading this course.
export async function GET(req: NextRequest) {
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? undefined;

  const conversations = await prisma.conversation.findMany({
    where: subjectId ? { subjectId } : undefined,
    orderBy: { updatedAt: "desc" },
    take: MAX_LIST,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json(
    conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
    }))
  );
}
