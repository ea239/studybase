"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { DIFFICULTY_LABELS } from "@/lib/labels";

export type PracticeQuestion = {
  id: string;
  stem: string;
  options: string[] | null;
  answer: string;
  explanation: string | null;
  difficulty: string;
  sourcePage: number | null;
  materialId: string;
  materialName: string;
  chapterId: string | null;
  chapterName: string;
};

const ALL = "__all__";
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

// A multiple-choice answer can be given as the letter ("B"), as the option's
// full text, or as "B) ..." — whichever the source used. Compare on the
// letter when we can recover one, and on the text otherwise.
function optionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function isCorrectOption(answer: string, option: string, index: number) {
  const clean = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/^[（(]?([a-z])[)）.、:：]\s*/, "$1 ")
      .replace(/\s+/g, " ");
  const a = clean(answer);
  const o = clean(option);
  const letter = optionLetter(index).toLowerCase();

  // "B", "B)", "(B)" — the answer names the option by letter.
  if (/^[a-z]$/.test(a) || /^[a-z]\s/.test(a)) {
    if (a === letter || a.startsWith(`${letter} `)) return true;
  }
  // Otherwise match the option's own text, allowing its leading letter label.
  const stripLabel = (s: string) => s.replace(/^[a-z]\s/, "").trim();
  return stripLabel(a) === stripLabel(o) && stripLabel(o).length > 0;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
        active
          ? "bg-neutral-900 text-white"
          : "bg-neutral-900/[0.05] text-neutral-600 hover:bg-neutral-900/[0.09] hover:text-neutral-900"
      }`}
    >
      {children}
    </button>
  );
}

export function Practice({ questions }: { questions: PracticeQuestion[] }) {
  const [chapter, setChapter] = useState<string>(ALL);
  const [difficulty, setDifficulty] = useState<string>(ALL);
  const [index, setIndex] = useState(0);
  // Per-question: the option index picked, or "revealed" for a written answer.
  const [picked, setPicked] = useState<Record<string, number | "revealed">>({});

  const chapters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const q of questions) seen.set(q.chapterId ?? "", q.chapterName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [questions]);

  const filtered = useMemo(
    () =>
      questions.filter(
        (q) =>
          (chapter === ALL || (q.chapterId ?? "") === chapter) &&
          (difficulty === ALL || q.difficulty === difficulty)
      ),
    [questions, chapter, difficulty]
  );

  // Filters change which questions exist, so an index from the old set would
  // point somewhere arbitrary in the new one.
  const safeIndex = Math.min(index, Math.max(filtered.length - 1, 0));
  const current = filtered[safeIndex];

  const answered = filtered.filter((q) => picked[q.id] !== undefined).length;
  const correct = filtered.filter((q) => {
    const pick = picked[q.id];
    return typeof pick === "number" && q.options && isCorrectOption(q.answer, q.options[pick], pick);
  }).length;

  const move = (delta: number) => setIndex(Math.min(Math.max(safeIndex + delta, 0), filtered.length - 1));
  const choose = (value: number | "revealed") => {
    if (current && picked[current.id] === undefined) {
      setPicked((prev) => ({ ...prev, [current.id]: value }));
    }
  };

  if (questions.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        还没有题目。上传课程资料（讲义/习题）后，AI 会自动从中提取练习题。
      </p>
    );
  }

  const pick = current ? picked[current.id] : undefined;
  const revealed = pick !== undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* Labelled, because the sidebar already lists the chapters: these
          narrow the question set rather than navigating anywhere. */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">筛选</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={chapter === ALL} onClick={() => { setChapter(ALL); setIndex(0); }}>
            全部章节
          </Chip>
          {chapters.map((c) => (
            <Chip
              key={c.id || "none"}
              active={chapter === c.id}
              onClick={() => { setChapter(c.id); setIndex(0); }}
            >
              {c.name}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={difficulty === ALL} onClick={() => { setDifficulty(ALL); setIndex(0); }}>
            全部难度
          </Chip>
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              active={difficulty === d}
              onClick={() => { setDifficulty(d); setIndex(0); }}
            >
              {DIFFICULTY_LABELS[d] ?? d}
            </Chip>
          ))}
        </div>
      </div>

      {filtered.length === 0 || !current ? (
        <p className="text-sm text-neutral-500">这个筛选条件下没有题目。</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-900/[0.07]">
              <div
                className="h-full rounded-full bg-neutral-900 transition-[width] duration-300"
                style={{ width: `${((safeIndex + 1) / filtered.length) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs text-neutral-400">
              {safeIndex + 1} / {filtered.length}
              {answered > 0 && ` · 已答 ${answered}`}
              {correct > 0 && ` · 对 ${correct}`}
            </span>
          </div>

          {/* Remounted per question so a previous answer's state never bleeds
              into the next one. */}
          <div key={current.id} className="surface animate-fade-up flex flex-col gap-4 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-[15px] leading-relaxed text-neutral-900">
                <Markdown>{current.stem}</Markdown>
              </div>
              <span className="shrink-0 rounded-full bg-neutral-900/[0.05] px-2 py-0.5 text-xs text-neutral-500">
                {DIFFICULTY_LABELS[current.difficulty] ?? current.difficulty}
              </span>
            </div>

            {current.options ? (
              <ul className="flex flex-col gap-2">
                {current.options.map((option, i) => {
                  const isAnswer = isCorrectOption(current.answer, option, i);
                  const isPicked = pick === i;
                  // Before answering every option looks neutral; afterwards the
                  // right one is always marked, whether or not it was chosen.
                  const tone = !revealed
                    ? "border-neutral-900/10 hover:border-neutral-900/25 hover:bg-neutral-900/[0.03]"
                    : isAnswer
                      ? "border-green-500/40 bg-green-500/[0.07]"
                      : isPicked
                        ? "border-red-500/40 bg-red-500/[0.06]"
                        : "border-neutral-900/10 opacity-60";
                  return (
                    <li key={i}>
                      <button
                        disabled={revealed}
                        onClick={() => choose(i)}
                        className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${tone}`}
                      >
                        <span className="mt-px shrink-0 font-mono text-xs text-neutral-400">
                          {optionLetter(i)}
                        </span>
                        <span className="min-w-0 flex-1 text-neutral-800">{option}</span>
                        {revealed && isAnswer && <span className="shrink-0 text-green-600">✓</span>}
                        {revealed && isPicked && !isAnswer && <span className="shrink-0 text-red-500">✕</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              !revealed && (
                <button
                  onClick={() => choose("revealed")}
                  className="w-fit rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-85"
                >
                  显示答案
                </button>
              )
            )}

            {revealed && (
              <div className="flex flex-col gap-3 border-t border-neutral-900/[0.07] pt-3">
                <div className="text-sm">
                  <p className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">答案</p>
                  <Markdown>{current.answer}</Markdown>
                </div>
                {current.explanation && (
                  <div className="text-sm text-neutral-700">
                    <p className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">解析</p>
                    <Markdown>{current.explanation}</Markdown>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-neutral-900/[0.07] pt-3">
              <Link
                href={`/materials/${current.materialId}`}
                className="min-w-0 truncate text-xs text-neutral-400 transition-colors hover:text-blue-600"
              >
                来自 {current.materialName}
                {current.sourcePage != null ? ` 第 ${current.sourcePage} 页` : ""} →
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => move(-1)}
                  disabled={safeIndex === 0}
                  className="rounded-lg bg-neutral-900/[0.05] px-3 py-1.5 text-xs transition-colors hover:bg-neutral-900/[0.1] disabled:opacity-35"
                >
                  上一题
                </button>
                <button
                  onClick={() => move(1)}
                  disabled={safeIndex >= filtered.length - 1}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-85 disabled:opacity-35"
                >
                  下一题
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
