import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readLearnSession } from "@/lib/learn/session";
import { LearnAuthError, verifyLearnSession } from "@/lib/learn/client";
import { refreshCourses, syncEnabledCourses } from "@/lib/learn/sync";

// Owner-only; the middleware enforces that before any of this runs.
export const dynamic = "force-dynamic";

export async function GET() {
  const [session, live, courses, subjects] = await Promise.all([
    readLearnSession(),
    // Asked of LEARN, not inferred from the cookie's own expiry.
    verifyLearnSession().catch(() => false),
    prisma.learnCourse.findMany({ orderBy: [{ enabled: "desc" }, { name: "asc" }] }),
    prisma.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return NextResponse.json({
    connected: live,
    /** Cookies are present but LEARN no longer accepts them. */
    stale: Boolean(session) && !live,
    expiresAt: session?.expiresAt ?? null,
    courses,
    subjects,
  });
}

export async function POST(req: NextRequest) {
  const { action } = await req.json().catch(() => ({ action: "" }));
  try {
    if (action === "refresh") {
      return NextResponse.json({ count: await refreshCourses() });
    }
    if (action === "sync") {
      return NextResponse.json({ reports: await syncEnabledCourses() });
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    if (err instanceof LearnAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Enable/disable a course and point it at a Subject.
export async function PATCH(req: NextRequest) {
  const { id, enabled, subjectId } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "缺少课程 id" }, { status: 400 });
  }
  const course = await prisma.learnCourse.update({
    where: { id },
    data: {
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(subjectId !== undefined ? { subjectId: subjectId || null } : {}),
    },
  });
  return NextResponse.json(course);
}
