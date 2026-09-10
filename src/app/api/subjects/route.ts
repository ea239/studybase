import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: { chapters: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(subjects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const subject = await prisma.subject.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  return NextResponse.json(subject, { status: 201 });
}
