import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type MaterialWithRelations = Prisma.MaterialGetPayload<{ include: { subject: true; chapter: true } }>;

export default async function DashboardPage() {
  const [recentMaterials, needsReview, subjectCount, materialCount, questionCount] = await Promise.all([
    prisma.material.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { subject: true, chapter: true },
    }),
    prisma.material.findMany({
      where: { status: "NEEDS_REVIEW" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { subject: true, chapter: true },
    }),
    prisma.subject.count(),
    prisma.material.count(),
    prisma.question.count(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="科目数" value={subjectCount} />
        <StatCard label="资料数" value={materialCount} />
        <StatCard label="题目数" value={questionCount} />
      </div>

      {needsReview.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">需要人工确认</h2>
          <div className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {needsReview.map((m: MaterialWithRelations) => (
              <Link
                key={m.id}
                href={`/materials/${m.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
              >
                <div>
                  <div className="font-medium">{m.filename}</div>
                  <div className="text-sm text-neutral-500">
                    {m.subject?.name ?? "未分类"} {m.chapter ? `· ${m.chapter.name}` : ""}
                  </div>
                </div>
                <StatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">最近资料</h2>
          <Link href="/materials" className="text-sm text-blue-600 hover:underline">
            查看全部 →
          </Link>
        </div>
        {recentMaterials.length === 0 ? (
          <p className="text-sm text-neutral-500">
            还没有上传任何资料。前往 <Link href="/materials" className="text-blue-600 hover:underline">资料库</Link> 上传第一份 PDF 吧。
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {recentMaterials.map((m: MaterialWithRelations) => (
              <Link
                key={m.id}
                href={`/materials/${m.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
              >
                <div>
                  <div className="font-medium">{m.filename}</div>
                  <div className="text-sm text-neutral-500">
                    {m.subject?.name ?? "未分类"} {m.chapter ? `· ${m.chapter.name}` : ""}
                  </div>
                </div>
                <StatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-neutral-500">{label}</div>
    </div>
  );
}
