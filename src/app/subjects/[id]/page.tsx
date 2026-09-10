import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DIFFICULTY_LABELS, STRUCTURED_TAG_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

type Tab = "lecture" | "exercises" | "lab" | "info";
const TABS: { key: Tab; label: string }[] = [
  { key: "lecture", label: "Lecture 大纲" },
  { key: "exercises", label: "练习题" },
  { key: "lab", label: "Lab" },
  { key: "info", label: "课程信息" },
];

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === tabParam)?.key ?? "lecture") as Tab;

  const subject = await prisma.subject.findUnique({
    where: { id },
    include: {
      chapters: { orderBy: { order: "asc" } },
      materials: {
        orderBy: { createdAt: "asc" },
        include: {
          knowledgePoints: { orderBy: { sourcePage: "asc" } },
          questions: { orderBy: { sourcePage: "asc" } },
        },
      },
    },
  });
  if (!subject) notFound();

  const notesMaterials = subject.materials.filter((m) => m.category === "NOTES");
  const labMaterials = subject.materials.filter((m) => m.category === "LAB");
  const overviewMaterials = subject.materials.filter((m) => m.category === "OVERVIEW");

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">{subject.name}</h1>

      <div className="flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/subjects/${id}?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "lecture" && <LectureOutline chapters={subject.chapters} materials={notesMaterials} />}
      {tab === "exercises" && <Exercises chapters={subject.chapters} materials={notesMaterials} />}
      {tab === "lab" && <LabList materials={labMaterials} />}
      {tab === "info" && <CourseInfo materials={overviewMaterials} />}
    </div>
  );
}

type Chapter = { id: string; name: string; order: number };
type KnowledgePoint = {
  id: string;
  title: string;
  content: string;
  sourcePage: number | null;
  tags: string | null;
  chapterId: string | null;
};
type Question = {
  id: string;
  stem: string;
  options: string | null;
  answer: string;
  explanation: string | null;
  sourcePage: number | null;
  difficulty: string;
  chapterId: string | null;
};
type Material = {
  id: string;
  filename: string;
  chapterId: string | null;
  knowledgePoints: KnowledgePoint[];
  questions: Question[];
};

function SourceLink({ materialId, materialName, page }: { materialId: string; materialName: string; page: number | null }) {
  return (
    <Link href={`/materials/${materialId}`} className="text-xs text-neutral-400 hover:text-blue-600 hover:underline">
      来自 {materialName}
      {page != null ? ` 第 ${page} 页` : ""} →
    </Link>
  );
}

function groupByChapter<T extends { chapterId: string | null }>(
  chapters: Chapter[],
  materials: { id: string; filename: string; chapterId: string | null; items: T[] }[]
) {
  const buckets = new Map<string | null, { materialId: string; materialName: string; item: T }[]>();
  for (const material of materials) {
    for (const item of material.items) {
      const key = item.chapterId ?? material.chapterId ?? null;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({ materialId: material.id, materialName: material.filename, item });
    }
  }
  const ordered: { chapter: Chapter | null; entries: { materialId: string; materialName: string; item: T }[] }[] = [];
  for (const chapter of chapters) {
    if (buckets.has(chapter.id)) ordered.push({ chapter, entries: buckets.get(chapter.id)! });
  }
  if (buckets.has(null)) ordered.push({ chapter: null, entries: buckets.get(null)! });
  return ordered;
}

function LectureOutline({ chapters, materials }: { chapters: Chapter[]; materials: Material[] }) {
  const grouped = groupByChapter(
    chapters,
    materials.map((m) => ({ id: m.id, filename: m.filename, chapterId: m.chapterId, items: m.knowledgePoints }))
  );

  if (materials.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        还没有课程资料。去<Link href="/materials" className="text-blue-600 hover:underline">资料库</Link>上传讲义/笔记，AI 会自动生成大纲。
      </p>
    );
  }
  if (grouped.length === 0) {
    return <p className="text-sm text-neutral-500">资料还在处理中，或未能提取出知识点。</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(({ chapter, entries }) => (
        <div key={chapter?.id ?? "unassigned"}>
          <h2 className="mb-2 font-semibold">{chapter?.name ?? "未分配章节"}</h2>
          <div className="flex flex-col gap-1">
            {entries.map(({ materialId, materialName, item }) => (
              <details key={item.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">{item.title}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{item.content}</p>
                <div className="mt-2">
                  <SourceLink materialId={materialId} materialName={materialName} page={item.sourcePage} />
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Exercises({ chapters, materials }: { chapters: Chapter[]; materials: Material[] }) {
  const grouped = groupByChapter(
    chapters,
    materials.map((m) => ({ id: m.id, filename: m.filename, chapterId: m.chapterId, items: m.questions }))
  );
  const totalQuestions = materials.reduce((sum, m) => sum + m.questions.length, 0);

  if (totalQuestions === 0) {
    return (
      <p className="text-sm text-neutral-500">
        还没有题目。上传课程资料（讲义/习题）后，AI 会自动从中提取练习题；已支持的题目也可以通过 GPT 插件按章节查询。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(({ chapter, entries }) => (
        <div key={chapter?.id ?? "unassigned"}>
          <h2 className="mb-2 font-semibold">
            {chapter?.name ?? "未分配章节"} ({entries.length})
          </h2>
          <div className="flex flex-col gap-2">
            {entries.map(({ materialId, materialName, item }) => {
              const options: string[] | null = item.options ? JSON.parse(item.options) : null;
              return (
                <details key={item.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">{item.stem}</summary>
                  {options && (
                    <ul className="mt-2 flex flex-col gap-1 text-sm text-neutral-700">
                      {options.map((opt, i) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      {DIFFICULTY_LABELS[item.difficulty] ?? item.difficulty}
                    </span>
                  </div>
                  <div className="mt-2 rounded-md bg-neutral-50 p-2 text-sm">
                    <p>
                      <span className="font-medium">答案：</span>
                      {item.answer}
                    </p>
                    {item.explanation && (
                      <p className="mt-1 text-neutral-700">
                        <span className="font-medium">解析：</span>
                        {item.explanation}
                      </p>
                    )}
                  </div>
                  <div className="mt-2">
                    <SourceLink materialId={materialId} materialName={materialName} page={item.sourcePage} />
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function tagGroups<T extends KnowledgePoint>(items: T[]) {
  const order = ["basic-info", "schedule", "lab-info", "requirement", "grading", "deadline"];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const tag = item.tags?.split(",").find((t) => order.includes(t)) ?? "other";
    if (!map.has(tag)) map.set(tag, []);
    map.get(tag)!.push(item);
  }
  return [...order, "other"].filter((t) => map.has(t)).map((tag) => ({ tag, items: map.get(tag)! }));
}

function LabList({ materials }: { materials: Material[] }) {
  if (materials.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        还没有上传 lab 相关文件。上传时选择「实验/作业说明」分类，AI 会自动整理出每个 lab 的要求、评分和截止日期。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500">共 {materials.length} 个 lab</p>
      {materials.map((m) => (
        <div key={m.id} className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">{m.filename}</h3>
            <Link href={`/materials/${m.id}`} className="text-xs text-blue-600 hover:underline">
              查看完整原文 →
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {tagGroups(m.knowledgePoints).map(({ tag, items }) => (
              <div key={tag}>
                <h4 className="mb-1 text-xs font-semibold text-neutral-500">
                  {STRUCTURED_TAG_LABELS[tag] ?? "其他"}
                </h4>
                <div className="flex flex-col gap-1">
                  {items.map((item) => (
                    <div key={item.id} className="text-sm">
                      <span className="font-medium">{item.title}：</span>
                      <span className="text-neutral-700">{item.content}</span>
                      {item.sourcePage != null && (
                        <span className="ml-1 text-xs text-neutral-400">(第 {item.sourcePage} 页)</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CourseInfo({ materials }: { materials: Material[] }) {
  const all = materials.flatMap((m) => m.knowledgePoints.map((kp) => ({ ...kp, materialId: m.id, materialName: m.filename })));

  if (all.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        还没有上传课程大纲/评分说明。上传时选择「课程大纲/评分说明/课表」分类，AI 会自动整理出基本信息、课程进度、评分占比和重要日期。
      </p>
    );
  }

  const groups = tagGroups(all);

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ tag, items }) => (
        <div key={tag}>
          <h2 className="mb-2 font-semibold">{STRUCTURED_TAG_LABELS[tag] ?? "其他"}</h2>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="text-sm text-neutral-700">{item.content}</div>
                <div className="mt-1">
                  <SourceLink materialId={item.materialId} materialName={item.materialName} page={item.sourcePage} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-neutral-400">
        当前分数（你实际拿到的成绩）还没有对应的录入功能，这需要一个独立的&ldquo;成绩记录&rdquo;功能——如果需要我可以再加。以上只是从大纲/评分说明文件里提取出的评分标准和占比。
      </p>
    </div>
  );
}
