import { prisma } from "@/lib/db";
import { MaterialsClient } from "./MaterialsClient";
import { LearnSessionNotice } from "@/components/LearnSessionNotice";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string }>;
}) {
  const { subjectId } = await searchParams;
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: { chapters: { orderBy: { order: "asc" } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <LearnSessionNotice />
      <h1 className="text-xl font-semibold">资料库</h1>
      <MaterialsClient subjects={subjects} initialSubjectId={subjectId} />
    </div>
  );
}
