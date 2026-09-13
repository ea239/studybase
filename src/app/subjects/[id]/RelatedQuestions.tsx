"use client";

import { useMemo, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { DetailModal } from "@/components/DetailModal";
import { DIFFICULTY_LABELS } from "@/lib/labels";

export type ChapterQuestion = {
  id: string;
  stem: string;
  options: string[] | null;
  answer: string;
  explanation: string | null;
  difficulty: string;
  sourcePage: number | null;
  materialName: string;
};

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "is", "are", "to", "in", "on", "for", "with", "that", "this",
  "as", "by", "be", "it", "its", "从", "的", "了", "在", "和", "与", "是", "对", "中", "个", "会",
]);

function tokens(text: string): Set<string> {
  const latin = text
    .toLowerCase()
    .replace(/\$[^$]*\$/g, " ") // formulas match everything and nothing
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  // CJK has no spaces; bigrams stand in for words, as in the subject search.
  const cjk = (text.match(/[一-鿿]{2,}/g) ?? []).flatMap((run) =>
    Array.from({ length: run.length - 1 }, (_, i) => run.slice(i, i + 2))
  );
  return new Set([...latin, ...cjk].filter((t) => !STOPWORDS.has(t)));
}

// Below this a "match" is one or two incidental words, which is worse than
// showing nothing: a wrong exercise attached to a section misleads.
const MIN_SCORE = 3;

/**
 * The exercises that actually bear on a section.
 *
 * Matching is on overlap between the section's own wording and the question,
 * scored and thresholded rather than ranked-and-truncated, so a section the
 * question bank does not cover gets no exercises rather than its three
 * least-bad ones.
 */
export function pickRelated(sectionText: string, questions: ChapterQuestion[], limit = 3) {
  const want = tokens(sectionText);
  if (want.size === 0) return [];

  return questions
    .map((q) => {
      const have = tokens(`${q.stem} ${q.answer}`);
      let score = 0;
      for (const t of want) if (have.has(t)) score++;
      return { q, score };
    })
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.q);
}

function QuestionBody({ question }: { question: ChapterQuestion }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[15px] leading-relaxed text-neutral-900">
        <Markdown>{question.stem}</Markdown>
      </div>

      {question.options && (
        <ul className="flex flex-col gap-1.5">
          {question.options.map((option, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-lg px-2 py-1 text-sm text-neutral-700">
              <span className="mt-px shrink-0 font-mono text-xs text-neutral-400">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 flex-1">
                <Markdown inline>{option}</Markdown>
              </span>
            </li>
          ))}
        </ul>
      )}

      {revealed ? (
        <div className="flex flex-col gap-3 border-t border-neutral-900/[0.07] pt-3">
          <div className="text-sm">
            <p className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">答案</p>
            <Markdown>{question.answer}</Markdown>
          </div>
          {question.explanation && (
            <div className="text-sm text-neutral-700">
              <p className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">解析</p>
              <Markdown>{question.explanation}</Markdown>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setRevealed(true)}
          className="w-fit rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-85"
        >
          显示答案
        </button>
      )}

      <p className="text-xs text-neutral-400">
        来自 {question.materialName}
        {question.sourcePage != null ? ` 第 ${question.sourcePage} 页` : ""}
      </p>
    </div>
  );
}

/** The row of exercises that sits under a section of the notes. */
export function RelatedQuestions({ questions }: { questions: ChapterQuestion[] }) {
  const [open, setOpen] = useState<ChapterQuestion | null>(null);
  const shown = useMemo(() => questions, [questions]);

  if (shown.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-neutral-400">练一练</span>
      {shown.map((q) => (
        <button
          key={q.id}
          onClick={() => setOpen(q)}
          title={q.stem}
          className="flex max-w-[26rem] items-center gap-1.5 rounded-full bg-neutral-900/[0.05] px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-900/[0.1] hover:text-neutral-900"
        >
          <span className="shrink-0 text-neutral-400">
            {DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}
          </span>
          <span className="truncate">{q.stem}</span>
        </button>
      ))}

      {open && (
        <DetailModal title="练习题" onClose={() => setOpen(null)}>
          <QuestionBody question={open} />
        </DetailModal>
      )}
    </div>
  );
}
