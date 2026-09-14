import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isGenerating } from "@/lib/generation";

export const dynamic = "force-dynamic";

function formatDue(e: {
  precision: string;
  startsAt: Date | null;
  endsAt: Date | null;
  approxLabel: string | null;
}) {
  if (e.precision === "RANGE" && e.startsAt && e.endsAt) {
    return `${e.startsAt.getMonth() + 1} 月 ${e.startsAt.getDate()} 日 – ${e.endsAt.getMonth() + 1} 月 ${e.endsAt.getDate()} 日`;
  }
  if (!e.startsAt) return e.approxLabel ?? "待公布";
  const t =
    e.startsAt.getHours() || e.startsAt.getMinutes()
      ? ` ${e.startsAt.getHours()}:${String(e.startsAt.getMinutes()).padStart(2, "0")}`
      : "";
  return `${e.startsAt.getMonth() + 1} 月 ${e.startsAt.getDate()} 日${t}`;
}

/** One item, with its brief — what the popup needs to render itself. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.courseEvent.findUnique({
    where: { id },
    include: { subject: { select: { id: true, name: true } } },
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  let brief = null;
  try {
    const parsed = event.brief ? JSON.parse(event.brief) : null;
    if (parsed?.version === 1 && Array.isArray(parsed.sections)) brief = parsed;
  } catch {
    // A brief written by an older version reads as "not generated yet".
  }

  return NextResponse.json({
    id: event.id,
    title: event.title,
    kind: event.kind,
    precision: event.precision,
    startsAt: event.startsAt?.toISOString() ?? null,
    dueLabel: formatDue(event),
    completedAt: event.completedAt?.toISOString() ?? null,
    brief,
    briefGeneratedAt: event.briefGeneratedAt?.toISOString() ?? null,
    generating: isGenerating(event.briefStartedAt),
    subjectId: event.subject.id,
    subjectName: event.subject.name,
  });
}

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
