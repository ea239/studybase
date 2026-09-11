import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((m) => ({ role: m.role, content: m.content, quote: m.quote })),
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.conversation.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
