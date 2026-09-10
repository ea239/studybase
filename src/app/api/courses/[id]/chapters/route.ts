import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params;
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const count = await prisma.chapter.count({ where: { courseId } });
  const chapter = await prisma.chapter.upsert({
    where: { courseId_name: { courseId, name } },
    update: {},
    create: { courseId, name, order: count },
  });
  return NextResponse.json(chapter, { status: 201 });
}
