import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const key of ["stem", "answer", "explanation", "difficulty"] as const) {
    if (key in body) data[key] = body[key];
  }
  if ("options" in body) {
    data.options = body.options ? JSON.stringify(body.options) : null;
  }
  data.isAiGenerated = false;
  data.confidence = null;

  const question = await prisma.question.update({ where: { id }, data });
  return NextResponse.json(question);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.question.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
