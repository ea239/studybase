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
  // Answers are hidden by default but revealed per question, plus a switch for
  // the whole list — reading through with everything open is a normal way to
  // revise, and so is covering them up to self-test.
  const [shownAll, setShownAll] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

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

  // Grouped under their chapter, so a long list still reads as the course.
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: PracticeQuestion[] }>();
    for (const q of filtered) {
      const key = q.chapterId ?? "";
      if (!map.has(key)) map.set(key, { name: q.chapterName, items: [] });
      map.get(key)!.items.push(q);
    }
    return [...map.values()];
  }, [filtered]);

  const isOpen = (id: string) => open[id] ?? shownAll;
  const toggleAll = () => {
    const next = !shownAll;
    setShownAll(next);
    // Clear the per-question overrides, or the switch appears not to work on
    // whichever ones were toggled by hand.
    setOpen({});
  };

  if (questions.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        还没有题目。上传课程资料（讲义/习题）后，AI 会自动从中提取练习题。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={chapter === ALL} onClick={() => setChapter(ALL)}>
            全部章节
          </Chip>
          {chapters.map((c) => (
            <Chip key={c.id || "none"} active={chapter === c.id} onClick={() => setChapter(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={difficulty === ALL} onClick={() => setDifficulty(ALL)}>
              全部难度
            </Chip>
            {DIFFICULTIES.map((d) => (
              <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                {DIFFICULTY_LABELS[d] ?? d}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400">{filtered.length} 题</span>
            <button
              onClick={toggleAll}
              className="rounded-lg bg-neutral-900/[0.05] px-3 py-1 text-xs transition-colors hover:bg-neutral-900/[0.1]"
            >
              {shownAll ? "隐藏全部答案" : "显示全部答案"}
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500">这个筛选条件下没有题目。</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group, gi) => (
            <section key={gi} className="flex flex-col gap-2.5">
              {chapter === ALL && (
                <h2 className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
                  {group.name} · {group.items.length} 题
                </h2>
              )}
              {group.items.map((q, qi) => {
                const revealed = isOpen(q.id);
                return (
                  <div key={q.id} className="surface flex flex-col gap-3 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-neutral-400">
                        {qi + 1}
                      </span>
                      <div className="min-w-0 flex-1 text-[15px] leading-relaxed text-neutral-900">
                        <Markdown>{q.stem}</Markdown>
                      </div>
                      <span className="shrink-0 rounded-full bg-neutral-900/[0.05] px-2 py-0.5 text-xs text-neutral-500">
                        {DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}
                      </span>
                    </div>

                    {q.options && (
                      <ul className="flex flex-col gap-1.5 pl-7">
                        {q.options.map((option, i) => {
                          const correct = revealed && isCorrectOption(q.answer, option, i);
                          return (
                            <li
                              key={i}
                              className={`flex items-start gap-2.5 rounded-lg px-2 py-1 text-sm ${
                                correct ? "bg-green-500/[0.09] text-neutral-900" : "text-neutral-700"
                              }`}
                            >
                              <span className="mt-px shrink-0 font-mono text-xs text-neutral-400">
                                {optionLetter(i)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <Markdown inline>{option}</Markdown>
                              </span>
                              {correct && <span className="shrink-0 text-green-600">✓</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {revealed && (
                      <div className="flex flex-col gap-2.5 border-t border-neutral-900/[0.07] pt-3 pl-7">
                        <div className="text-sm">
                          <p className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">
                            答案
                          </p>
                          <Markdown>{q.answer}</Markdown>
                        </div>
                        {q.explanation && (
                          <div className="text-sm text-neutral-700">
                            <p className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">
                              解析
                            </p>
                            <Markdown>{q.explanation}</Markdown>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pl-7">
                      <Link
                        href={`/materials/${q.materialId}`}
                        className="min-w-0 truncate text-xs text-neutral-400 transition-colors hover:text-blue-600"
                      >
                        来自 {q.materialName}
                        {q.sourcePage != null ? ` 第 ${q.sourcePage} 页` : ""} →
                      </Link>
                      <button
                        onClick={() => setOpen((prev) => ({ ...prev, [q.id]: !revealed }))}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-900/[0.05] hover:text-neutral-900"
                      >
                        {revealed ? "隐藏答案" : "显示答案"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
