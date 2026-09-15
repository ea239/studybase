"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ActiveTask, TaskKind } from "@/app/api/tasks/route";

const KIND_LABEL: Record<TaskKind, string> = {
  material: "解析资料",
  chapter: "写章节笔记",
  brief: "整理作业",
  facts: "提取课程信息",
};

const KIND_TONE: Record<TaskKind, string> = {
  material: "bg-sky-500/15 text-sky-800",
  chapter: "bg-violet-500/15 text-violet-800",
  brief: "bg-amber-500/15 text-amber-800",
  facts: "bg-emerald-500/15 text-emerald-800",
};

// Often enough to feel live while something is running; idle polling backs
// right off, since most of the time there is nothing to report.
const POLL_ACTIVE_MS = 3000;
const POLL_IDLE_MS = 15000;

const SHAPE_KEY = "studybase.taskdock.shape";

type Shape = "banner" | "expanded" | "minimised";

function Ring({ done, total }: { done: number; total: number }) {
  const r = 15.5;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? done / total : 0;
  return (
    <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-neutral-900/10" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-neutral-900/70 transition-[stroke-dashoffset] duration-500"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
      />
    </svg>
  );
}

/**
 * A floating report of what the app is working on, bottom-right.
 *
 * Generation outlives the page that started it, and until now the only sign of
 * that was a page that happened to be open saying so. This says it everywhere,
 * and goes away on its own when there is nothing to say.
 */
export function TaskDock() {
  const [tasks, setTasks] = useState<ActiveTask[]>([]);
  const [hidden, setHidden] = useState(false);
  const [shape, setShape] = useState<Shape>(() => {
    // Read at construction rather than in an effect. Safe against hydration
    // mismatch because the dock renders nothing until tasks have loaded, which
    // only happens on the client.
    try {
      const saved = localStorage.getItem(SHAPE_KEY);
      if (saved === "banner" || saved === "expanded" || saved === "minimised") return saved;
    } catch {
      // Private windows and blocked storage: the default is fine.
    }
    return "banner";
  });
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  // The most tasks seen since this run of work began, so the ring has
  // something to be a fraction of. Reset when the queue empties. State rather
  // than a ref because the ring is rendered from it.
  const [peak, setPeak] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) return;
      const data: { tasks: ActiveTask[]; hidden: boolean } = await res.json();
      setHidden(data.hidden);
      setTasks(data.tasks);
      setPeak((current) => (data.tasks.length === 0 ? 0 : Math.max(current, data.tasks.length)));
    } catch {
      // A failed poll just waits for the next one.
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      await load();
      if (stopped) return;
      // Read from state via the setter to avoid re-subscribing every poll.
      setTasks((current) => {
        timer = setTimeout(tick, current.length > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS);
        return current;
      });
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!menuAt) return;
    const close = () => setMenuAt(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuAt]);

  const changeShape = (next: Shape) => {
    setShape(next);
    try {
      localStorage.setItem(SHAPE_KEY, next);
    } catch {
      // Not remembering the shape is not worth failing over.
    }
  };

  async function dismissForGood() {
    setMenuAt(null);
    setHidden(true);
    await fetch("/api/settings/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: true }),
    }).catch(() => {});
  }

  if (hidden || tasks.length === 0) return null;

  const running = tasks.find((t) => t.state === "running") ?? tasks[0];
  const remaining = tasks.length;
  const done = Math.max(peak - remaining, 0);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuAt({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      {/* Fixed to the viewport and above everything but a modal, so it reads as
          one persistent thing rather than part of whichever page is open. */}
      <div className="fixed right-6 bottom-6 z-[70] flex flex-col items-end gap-2">
        {shape === "minimised" ? (
          <button
            onClick={() => changeShape("banner")}
            onContextMenu={onContextMenu}
            title={`还有 ${remaining} 项任务 · ${running.title}`}
            aria-label={`还有 ${remaining} 项任务，点击展开`}
            className="surface surface-interactive relative flex size-14 items-center justify-center rounded-full"
          >
            <Ring done={done} total={peak} />
            <span className="relative text-base font-medium tabular-nums text-neutral-800">
              {remaining}
            </span>
          </button>
        ) : (
          <div
            onContextMenu={onContextMenu}
            className="surface animate-fade-up flex w-[25rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl"
          >
            <div className="flex items-center gap-2.5 px-4 py-3">
              <span className="relative flex size-5 shrink-0 items-center justify-center">
                <span className="absolute size-2.5 animate-ping rounded-full bg-amber-500/60" />
                <span className="size-2 rounded-full bg-amber-500" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-neutral-800">{running.title}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-neutral-400">
                  {KIND_LABEL[running.kind]}
                  {running.subject && ` · ${running.subject}`}
                  {remaining > 1 && ` · 队列中还有 ${remaining - 1} 项`}
                </p>
              </div>

              <button
                onClick={() => changeShape(shape === "expanded" ? "banner" : "expanded")}
                aria-label={shape === "expanded" ? "收起队列" : "展开队列"}
                aria-expanded={shape === "expanded"}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`size-3.5 transition-transform duration-200 ${
                    shape === "expanded" ? "rotate-180" : ""
                  }`}
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>

              <button
                onClick={() => changeShape("minimised")}
                aria-label="最小化"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            {shape === "expanded" && (
              <ul className="max-h-[21rem] overflow-y-auto border-t border-neutral-900/[0.07]">
                {tasks.map((task) => (
                  <li key={task.id} className="border-b border-neutral-900/[0.04] last:border-b-0">
                    <Link
                      href={task.href ?? "#"}
                      className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-neutral-900/[0.03]"
                    >
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${KIND_TONE[task.kind]}`}
                      >
                        {KIND_LABEL[task.kind]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-700">
                        {task.title}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-neutral-400">
                        {task.state === "running" ? "进行中" : "等待"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {menuAt && (
        <div
          className="surface fixed z-[75] rounded-lg py-1 text-xs"
          style={{ left: menuAt.x, top: menuAt.y }}
        >
          <button
            onClick={dismissForGood}
            className="w-full px-3 py-1.5 text-left whitespace-nowrap text-neutral-700 transition-colors hover:bg-neutral-900/[0.06]"
          >
            彻底关闭（可在设置里重新开启）
          </button>
        </div>
      )}
    </>
  );
}
