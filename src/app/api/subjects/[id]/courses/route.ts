import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: subjectId } = await params;
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const course = await prisma.course.upsert({
    where: { subjectId_name: { subjectId, name } },
    update: {},
    create: { subjectId, name },
  });
  return NextResponse.json(course, { status: 201 });
}
