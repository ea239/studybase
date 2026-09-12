import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { STRUCTURED_TAG_LABELS } from "@/lib/labels";
import { Practice, type PracticeQuestion } from "./Practice";
import { SubjectSearch } from "./SubjectSearch";
import { SubjectHome } from "./SubjectHome";
import { WorkList } from "./WorkList";
import ChapterReader from "./ChapterReader";
import { AskAI } from "@/components/AskAI";
import type { ChapterOverviewContent } from "@/lib/ai/chapterOverview";

export const dynamic = "force-dynamic";

type Tab = "home" | "lecture" | "exercises" | "work" | "lab" | "info";
const TABS: { key: Tab; label: string }[] = [
  { key: "home", label: "总览" },
  { key: "lecture", label: "Lecture 大纲" },
  { key: "exercises", label: "练习题" },
  { key: "work", label: "作业" },
  { key: "lab", label: "Lab" },
  { key: "info", label: "课程信息" },
];
const OTHER_TABS = TABS.filter((t) => t.key !== "lecture" && t.key !== "home");

// Facts written by an older version read as "not generated" rather than
// rendering half-correctly.
function parseFacts(raw: string | null | undefined): { label: string; value: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parsed?.version === 1 && Array.isArray(parsed.facts) ? parsed.facts : [];
  } catch {
    return [];
  }
}

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
  const t = e.startsAt.getHours() || e.startsAt.getMinutes()
    ? ` ${e.startsAt.getHours()}:${String(e.startsAt.getMinutes()).padStart(2, "0")}`
    : "";
  return `${e.startsAt.getMonth() + 1} 月 ${e.startsAt.getDate()} 日${t}`;
}

// Only the current note-style format renders. Anything older (the v1 prose
// blocks) reads as "not generated yet" so it gets regenerated on demand.
function parseOverview(raw: string | null | undefined): ChapterOverviewContent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version === 2 && Array.isArray(parsed.sections)) return parsed as ChapterOverviewContent;
    return null;
  } catch {
    return null;
  }
}

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; chapter?: string; item?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam, chapter: chapterParam, item: itemParam } = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === tabParam)?.key ?? "home") as Tab;

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
      // Exams are listed alongside the work: they are things with a date that
      // the student has to prepare for, which is what this view is for.
      events: { orderBy: [{ startsAt: "asc" }] },
    },
  });
  if (!subject) notFound();

  const notesMaterials = subject.materials.filter((m) => m.category === "NOTES");
  const labMaterials = subject.materials.filter((m) => m.category === "LAB");
  const overviewMaterials = subject.materials.filter((m) => m.category === "OVERVIEW");

  const lectureGroups = groupByChapter(
    subject.chapters,
    notesMaterials.map((m) => ({ id: m.id, filename: m.filename, chapterId: m.chapterId, items: m.knowledgePoints }))
  );
  const groupKey = (chapter: Chapter | null) => chapter?.id ?? "unassigned";
  const defaultKey = lectureGroups.length > 0 ? groupKey(lectureGroups[0].chapter) : null;
  const activeKey = chapterParam ?? defaultKey;
  const selectedGroup = lectureGroups.find((g) => groupKey(g.chapter) === activeKey);

  // Counts for the overview tiles. Exams sit with the work: they are dated
  // things to prepare for, which is what that tile is about.
  const workItems = subject.events.filter((e) => e.kind !== "OTHER");
  const workSummary = {
    total: workItems.length,
    done: workItems.filter((e) => e.completedAt).length,
    overdue: workItems.filter(
      (e) => !e.completedAt && e.precision === "EXACT" && e.startsAt && e.startsAt < new Date()
    ).length,
    next: workItems
      .filter((e) => !e.completedAt && e.precision === "EXACT" && e.startsAt)
      .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())
      .map((e) => ({ title: e.title, due: formatDue(e), at: e.startsAt!.toISOString() }))[0] ?? null,
  };

  const navItem = (active: boolean) =>
    `shrink-0 snap-start rounded-xl px-3 py-2 text-sm whitespace-nowrap transition-all duration-200 lg:whitespace-normal ${
      active
        ? "bg-white/80 font-medium text-neutral-900 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_8px_20px_-14px_rgba(16,24,40,0.3)]"
        : "text-neutral-500 hover:bg-white/60 hover:text-neutral-900"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up">
        <Link href="/" className="text-xs text-neutral-400 transition-colors hover:text-neutral-700">
          ← 科目总览
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{subject.name}</h1>
      </div>

      <SubjectSearch subjectId={id} />

      {tab === "home" ? (
        <SubjectHome
          subjectId={id}
          chapters={lectureGroups.map(({ chapter, entries }) => ({
            key: groupKey(chapter),
            name: chapter?.name ?? "其他内容",
            points: entries.length,
          }))}
          facts={{ status: subject.factsStatus, items: parseFacts(subject.facts) }}
          counts={{
            questions: notesMaterials.reduce((n, m) => n + m.questions.length, 0),
            labs: labMaterials.length,
            materials: subject.materials.length,
          }}
          work={workSummary}
        />
      ) : (
      <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
        {/* Phone: a horizontally scrollable strip above the content. Desktop:
            the sticky 208px sidebar. */}
        <nav
          data-chapter-nav
          className="animate-fade-up -mx-4 flex snap-x gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-20 lg:mx-0 lg:w-52 lg:shrink-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0"
        >
          {/* Without this there is no way back to the overview from inside a
              tile — only out of the subject entirely, and back in. */}
          <Link href={`/subjects/${id}`} className={navItem(false)}>
            ← 总览
          </Link>
          <div className="hidden px-3 text-xs font-medium tracking-wide text-neutral-400 uppercase lg:mt-4 lg:mb-1 lg:block">章节</div>
          {lectureGroups.length === 0 && <p className="px-3 text-sm text-neutral-400">暂无章节</p>}
          {lectureGroups.map(({ chapter }) => {
            const key = groupKey(chapter);
            const active = tab === "lecture" && key === activeKey;
            return (
              <Link
                key={key}
                href={`/subjects/${id}?tab=lecture&chapter=${key}`}
                className={navItem(active)}
              >
                {chapter?.name ?? "其他内容"}
              </Link>
            );
          })}

          <div className="hidden px-3 text-xs font-medium tracking-wide text-neutral-400 uppercase lg:mt-5 lg:mb-1 lg:block">其他</div>
          {OTHER_TABS.map((t) => (
            <Link key={t.key} href={`/subjects/${id}?tab=${t.key}`} className={navItem(tab === t.key)}>
              {t.label}
            </Link>
          ))}
        </nav>

        <div data-content-pane className="animate-fade-up min-w-0 flex-1">
          {tab === "lecture" &&
            (lectureGroups.length === 0 ? (
              <p className="text-sm text-neutral-500">
                还没有课程资料。去
                <Link href="/materials" className="text-blue-600 hover:underline">
                  资料库
                </Link>
                上传讲义/笔记，AI 会自动生成大纲。
              </p>
            ) : (
              selectedGroup && (
                <ChapterReader
                  // Remount per chapter: ChapterReader seeds state from these
                  // props, and without a new key React reuses the instance, so
                  // switching chapters kept showing the previous chapter's notes.
                  key={selectedGroup.chapter?.id ?? "unassigned"}
                  chapterId={selectedGroup.chapter?.id ?? null}
                  chapterName={selectedGroup.chapter?.name ?? "其他内容"}
                  initialOverview={parseOverview(selectedGroup.chapter?.overview)}
                  initialGeneratedAt={selectedGroup.chapter?.overviewGeneratedAt?.toISOString() ?? null}
                  entries={selectedGroup.entries}
                />
              )
            ))}
          {tab === "work" && (
            <WorkList
              subjectId={id}
              initialItemId={itemParam}
              otherCount={subject.events.filter((e) => e.kind === "OTHER").length}
              items={subject.events
                .filter((e) => e.kind !== "OTHER")
                .map((e) => ({
                  id: e.id,
                  title: e.title,
                  kind: e.kind,
                  precision: e.precision,
                  startsAt: e.startsAt?.toISOString() ?? null,
                  endsAt: e.endsAt?.toISOString() ?? null,
                  approxLabel: e.approxLabel,
                  completedAt: e.completedAt?.toISOString() ?? null,
                  hasBrief: Boolean(e.brief),
                }))}
            />
          )}

          {tab === "exercises" && (
            <Practice questions={buildPracticeQuestions(subject.chapters, notesMaterials)} />
          )}
          {tab === "lab" && <LabList materials={labMaterials} />}
          {tab === "info" && <CourseInfo materials={overviewMaterials} />}
        </div>
      </div>
      )}

      <AskAI
        context={`${subject.name} — ${selectedGroup?.chapter?.name ?? ""}`}
        subjectId={subject.id}
        chapterId={selectedGroup?.chapter?.id ?? null}
      />
    </div>
  );
}

type Chapter = {
  id: string;
  name: string;
  order: number;
  overview: string | null;
  overviewGeneratedAt: Date | null;
};
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

// Flattens every question in the subject into the shape the practice view
// needs, resolving each one's chapter up front: a question inherits its
// material's chapter when the extraction didn't give it one of its own.
function buildPracticeQuestions(chapters: Chapter[], materials: Material[]): PracticeQuestion[] {
  const names = new Map(chapters.map((c) => [c.id, c.name]));
  const order = new Map(chapters.map((c, i) => [c.id, i]));

  const questions = materials.flatMap((material) =>
    material.questions.map((q) => {
      const chapterId = q.chapterId ?? material.chapterId ?? null;
      let options: string[] | null = null;
      if (q.options) {
        // Stored as a JSON string; a malformed one must not take the page down.
        try {
          const parsed = JSON.parse(q.options);
          if (Array.isArray(parsed) && parsed.length) options = parsed.map(String);
        } catch {
          options = null;
        }
      }
      return {
        id: q.id,
        stem: q.stem,
        options,
        answer: q.answer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        sourcePage: q.sourcePage,
        materialId: material.id,
        materialName: material.filename,
        chapterId,
        chapterName: (chapterId && names.get(chapterId)) || "未分配章节",
      };
    })
  );

  // Chapter order first, then page order, so working straight through follows
  // the course rather than the order files happened to be uploaded.
  return questions.sort((a, b) => {
    const ca = a.chapterId ? (order.get(a.chapterId) ?? 1e6) : 1e6 + 1;
    const cb = b.chapterId ? (order.get(b.chapterId) ?? 1e6) : 1e6 + 1;
    if (ca !== cb) return ca - cb;
    return (a.sourcePage ?? 0) - (b.sourcePage ?? 0);
  });
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
        <div key={m.id} className="surface rounded-xl p-4">
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
              <div key={item.id} className="surface rounded-xl p-3">
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
