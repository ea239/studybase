import { prisma } from "@/lib/db";
import { CalendarView, type CalendarEvent } from "./CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const events = await prisma.courseEvent.findMany({
    orderBy: [{ startsAt: "asc" }],
    include: { subject: { select: { id: true, name: true } } },
  });

  const shaped: CalendarEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind,
    precision: e.precision,
    // Serialised as ISO so the client parses it back in the viewer's own zone.
    startsAt: e.startsAt?.toISOString() ?? null,
    endsAt: e.endsAt?.toISOString() ?? null,
    approxLabel: e.approxLabel,
    subjectId: e.subject.id,
    subjectName: e.subject.name,
    materialId: e.materialId,
    completedAt: e.completedAt?.toISOString() ?? null,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">日历</h1>
        <p className="mt-1 text-sm text-neutral-500">从课程大纲和实验说明里提取的截止日期。</p>
      </div>
      <CalendarView events={shaped} />
    </div>
  );
}
