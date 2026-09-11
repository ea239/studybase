import { prisma } from "@/lib/db";
import { HomeClient } from "./HomeClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [subjects, materialCounts] = await Promise.all([
    prisma.subject.findMany({
      orderBy: { name: "asc" },
      include: { chapters: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
    }),
    // Questions hang off materials, and a question may have no chapter — so
    // count through the material's subject rather than through chapters.
    prisma.material.findMany({
      select: { subjectId: true, _count: { select: { questions: true } } },
    }),
  ]);

  const stats = new Map<string, { materials: number; questions: number }>();
  for (const m of materialCounts) {
    if (!m.subjectId) continue;
    const entry = stats.get(m.subjectId) ?? { materials: 0, questions: 0 };
    entry.materials += 1;
    entry.questions += m._count.questions;
    stats.set(m.subjectId, entry);
  }

  return (
    <HomeClient
      subjects={subjects.map((s) => ({
        id: s.id,
        name: s.name,
        chapters: s.chapters,
        materialCount: stats.get(s.id)?.materials ?? 0,
        questionCount: stats.get(s.id)?.questions ?? 0,
      }))}
    />
  );
}
