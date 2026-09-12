import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Ticks a piece of work off, or un-ticks it. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { completed } = await req.json().catch(() => ({}));
  if (typeof completed !== "boolean") {
    return NextResponse.json({ error: "缺少 completed" }, { status: 400 });
  }

  const event = await prisma.courseEvent.update({
    where: { id },
    data: { completedAt: completed ? new Date() : null },
  });
  return NextResponse.json({ completedAt: event.completedAt });
}
