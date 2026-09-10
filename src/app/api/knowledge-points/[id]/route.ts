import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const key of ["title", "content", "tags"] as const) {
    if (key in body) data[key] = body[key];
  }
  // Any human edit marks the row as no longer purely AI-generated, so a
  // future reprocess (which only clears isAiGenerated: true rows) leaves it alone.
  data.isAiGenerated = false;
  data.confidence = null;

  const kp = await prisma.knowledgePoint.update({ where: { id }, data });
  return NextResponse.json(kp);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.knowledgePoint.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
