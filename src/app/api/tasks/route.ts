import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GENERATION_TIMEOUT_MS } from "@/lib/generation";

export const dynamic = "force-dynamic";

export const TASKS_HIDDEN_KEY = "tasks_dock_hidden";

export type TaskKind = "material" | "chapter" | "brief" | "facts";

export type ActiveTask = {
  id: string;
  kind: TaskKind;
  title: string;
  subject: string | null;
  /** Running now, or waiting its turn behind something else. */
  state: "running" | "queued";
  href: string | null;
};

/**
 * Everything the app is currently working on, across all four kinds of work.
 *
 * Read from the rows themselves rather than from an in-memory queue: the parse
 * queue lives in this process, but generation started from a page that has
 * since been closed does not, and the point of showing this at all is that the
 * work outlives the page that asked for it.
 */
export async function GET() {
  const since = new Date(Date.now() - GENERATION_TIMEOUT_MS);

  const [materials, chapters, events, subjects, hidden] = await Promise.all([
    prisma.material.findMany({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
      orderBy: { updatedAt: "asc" },
      select: { id: true, filename: true, status: true, subject: { select: { name: true } } },
    }),
    prisma.chapter.findMany({
      where: { overviewStartedAt: { gt: since } },
      select: { id: true, name: true, subjectId: true, subject: { select: { name: true } } },
    }),
    prisma.courseEvent.findMany({
      where: { briefStartedAt: { gt: since } },
      select: { id: true, title: true, subjectId: true, subject: { select: { name: true } } },
    }),
    prisma.subject.findMany({
      where: { factsStatus: "GENERATING" },
      select: { id: true, name: true },
    }),
    prisma.setting.findUnique({ where: { key: TASKS_HIDDEN_KEY } }),
  ]);

  const tasks: ActiveTask[] = [
    ...materials.map((m) => ({
      id: `material:${m.id}`,
      kind: "material" as const,
      title: m.filename,
      subject: m.subject?.name ?? null,
      state: (m.status === "PROCESSING" ? "running" : "queued") as "running" | "queued",
      href: `/materials/${m.id}`,
    })),
    ...chapters.map((c) => ({
      id: `chapter:${c.id}`,
      kind: "chapter" as const,
      title: c.name,
      subject: c.subject.name,
      state: "running" as const,
      href: `/subjects/${c.subjectId}?tab=lecture&chapter=${c.id}`,
    })),
    ...events.map((e) => ({
      id: `brief:${e.id}`,
      kind: "brief" as const,
      title: e.title,
      subject: e.subject.name,
      state: "running" as const,
      href: `/subjects/${e.subjectId}?tab=work&item=${e.id}`,
    })),
    ...subjects.map((s) => ({
      id: `facts:${s.id}`,
      kind: "facts" as const,
      title: "课程信息",
      subject: s.name,
      state: "running" as const,
      href: `/subjects/${s.id}`,
    })),
  ];

  // Running first: the dock's collapsed form shows one line, and it should be
  // what is happening rather than what is waiting.
  tasks.sort((a, b) => (a.state === b.state ? 0 : a.state === "running" ? -1 : 1));

  return NextResponse.json({ tasks, hidden: hidden?.value === "1" });
}
