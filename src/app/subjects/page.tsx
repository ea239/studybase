import { prisma } from "@/lib/db";
import { SubjectsClient } from "./SubjectsClient";

export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: { chapters: { orderBy: { order: "asc" } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">全部科目</h1>
      <SubjectsClient initialSubjects={subjects} />
    </div>
  );
}
