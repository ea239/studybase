"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export type HomeChapter = { key: string; name: string; points: number };
export type HomeFacts = {
  status: "NONE" | "GENERATING" | "READY" | "EMPTY";
  items: { label: string; value: string }[];
};

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
      <rect x="1" y="2" width="14" height="2.5" rx="1.25" />
      <rect x="1" y="6.75" width="14" height="2.5" rx="1.25" />
      <rect x="1" y="11.5" width="14" height="2.5" rx="1.25" />
    </svg>
  );
}

function CourseFacts({ facts }: { facts: HomeFacts }) {
  if (facts.status === "GENERATING") {
    return (
      <p className="flex items-center gap-2 text-sm text-neutral-500">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
        正在生成中…
      </p>
    );
  }
  if (facts.status !== "READY" || facts.items.length === 0) {
    return <p className="text-sm text-neutral-400">暂无</p>;
  }
  return (
    // Generous row spacing and a divider per row: these are separate facts
    // scanned one at a time, and packed together they read as a paragraph.
    <dl className="flex flex-col">
      {facts.items.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 border-t border-neutral-900/[0.06] py-3 first:border-t-0 first:pt-0 sm:flex-row sm:gap-4"
        >
          <dt className="shrink-0 text-xs tracking-wide text-neutral-400 sm:w-20 sm:pt-0.5">
            {item.label}
          </dt>
          <dd className="min-w-0 flex-1 text-sm leading-relaxed text-neutral-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SubjectHome({
  subjectId,
  chapters,
  facts,
  counts,
  work,
  children,
}: {
  subjectId: string;
  chapters: HomeChapter[];
  facts: HomeFacts;
  counts: { questions: number; labs: number; materials: number };
  work: { total: number; done: number; overdue: number; next: { title: string; due: string } | null };
  children?: React.ReactNode;
}) {
  const [view, setView] = useState<"grid" | "list">("grid");
  // The fade only means something when there is something below the fold; a
  // permanent one is just a band across the bottom of the panel.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Driven by the observer rather than by the effect body: the size is an
    // external fact, and switching view or resizing changes it.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, view, chapters.length]);

  const tile =
    "surface surface-interactive animate-fade-up flex flex-col gap-2 rounded-2xl p-4 text-left";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section className="surface animate-fade-up flex flex-col gap-3 rounded-2xl p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold tracking-tight">课程信息</h2>
            <Link href={`/subjects/${subjectId}?tab=info`} className="text-xs text-neutral-400 hover:text-neutral-900">
              全部 →
            </Link>
          </div>
          <CourseFacts facts={facts} />
        </section>

        <section className="surface animate-fade-up flex flex-col gap-3 rounded-2xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold tracking-tight">章节</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">{chapters.length} 章</span>
              <div className="flex items-center rounded-lg bg-neutral-900/[0.05] p-0.5">
                {(["grid", "list"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setView(mode)}
                    aria-label={mode === "grid" ? "网格视图" : "列表视图"}
                    aria-pressed={view === mode}
                    className={`rounded-md px-2 py-1 transition-colors ${
                      view === mode
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-400 hover:text-neutral-700"
                    }`}
                  >
                    {mode === "grid" ? <GridIcon /> : <ListIcon />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {chapters.length === 0 ? (
            <p className="text-sm text-neutral-400">
              还没有章节。去
              <Link href="/materials" className="text-blue-600 hover:underline">
                资料库
              </Link>
              上传课程资料。
            </p>
          ) : (
            // Fixed height, so a course with thirty chapters does not push the
            // tiles below it off the screen and a course with three does not
            // leave the row lopsided. Overflow fades rather than being cut, to
            // show there is more.
            <div className="relative">
              <div ref={scrollerRef} className="max-h-[19rem] overflow-y-auto pr-1">
                {view === "grid" ? (
                  <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {chapters.map((c) => (
                      <li key={c.key}>
                        <Link
                          href={`/subjects/${subjectId}?tab=lecture&chapter=${c.key}`}
                          className="surface surface-interactive flex h-full flex-col justify-between gap-2 rounded-xl p-3"
                        >
                          <span className="line-clamp-2 text-sm leading-snug text-neutral-800">{c.name}</span>
                          <span className="text-xs text-neutral-400">{c.points} 个知识点</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {chapters.map((c) => (
                      <li key={c.key}>
                        <Link
                          href={`/subjects/${subjectId}?tab=lecture&chapter=${c.key}`}
                          className="flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-neutral-900/[0.04]"
                        >
                          <span className="min-w-0 truncate text-sm text-neutral-800">{c.name}</span>
                          <span className="shrink-0 text-xs text-neutral-400">{c.points}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {overflowing && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl bg-gradient-to-t from-[rgba(253,251,247,0.95)] to-transparent"
                />
              )}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`/subjects/${subjectId}?tab=work`} className={tile}>
          <span className="text-xs text-neutral-400">作业与考试</span>
          <span className="text-2xl font-semibold tracking-tight">
            {work.total - work.done}
            <span className="ml-1 text-sm font-normal text-neutral-400">待完成</span>
          </span>
          {work.overdue > 0 ? (
            <span className="text-xs font-medium text-red-600">{work.overdue} 项已逾期</span>
          ) : work.next ? (
            <span className="truncate text-xs text-neutral-500">
              最近：{work.next.title} · {work.next.due}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">没有待办</span>
          )}
        </Link>

        <Link href={`/subjects/${subjectId}?tab=exercises`} className={tile}>
          <span className="text-xs text-neutral-400">练习题</span>
          <span className="text-2xl font-semibold tracking-tight">
            {counts.questions}
            <span className="ml-1 text-sm font-normal text-neutral-400">题</span>
          </span>
          <span className="text-xs text-neutral-400">按章节筛选，答案可隐藏</span>
        </Link>

        <Link href={`/subjects/${subjectId}?tab=lab`} className={tile}>
          <span className="text-xs text-neutral-400">Lab</span>
          <span className="text-2xl font-semibold tracking-tight">
            {counts.labs}
            <span className="ml-1 text-sm font-normal text-neutral-400">份</span>
          </span>
          <span className="text-xs text-neutral-400">实验与作业说明</span>
        </Link>

        <Link href="/materials" className={tile}>
          <span className="text-xs text-neutral-400">资料</span>
          <span className="text-2xl font-semibold tracking-tight">
            {counts.materials}
            <span className="ml-1 text-sm font-normal text-neutral-400">份</span>
          </span>
          <span className="text-xs text-neutral-400">原始课件与文档</span>
        </Link>
      </div>

      {children}
    </div>
  );
}
