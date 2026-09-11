"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Subject = {
  id: string;
  name: string;
  chapters: { id: string; name: string }[];
  materialCount: number;
  questionCount: number;
};

type SearchResult = {
  materials: { id: string; filename: string }[];
  knowledgePoints: {
    id: string;
    title: string;
    content: string;
    sourcePage: number | null;
    material: { id: string; filename: string };
  }[];
  questions: {
    id: string;
    stem: string;
    sourcePage: number | null;
    material: { id: string; filename: string } | null;
  }[];
};

export function HomeClient({ subjects }: { subjects: Subject[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [creating, setCreating] = useState(false);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) {
      setResult(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error("搜索失败");
      setResult(await res.json());
      setSearchError(null);
    } catch {
      setSearchError("搜索失败，请重试");
    } finally {
      setSearching(false);
    }
  }

  async function addSubject() {
    const name = newSubject.trim();
    if (!name) return;
    setCreating(true);
    await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setNewSubject("");
    setCreating(false);
    router.refresh();
  }

  const resultCount = result
    ? result.materials.length + result.knowledgePoints.length + result.questions.length
    : 0;

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={runSearch} className="animate-fade-up relative max-w-xl">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-neutral-400"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) setResult(null);
          }}
          placeholder="搜索知识点、题目、资料…"
          className="surface w-full rounded-full py-2.5 pr-24 pl-11 text-sm outline-none transition-shadow duration-300 placeholder:text-neutral-400 focus:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_20px_44px_-20px_rgba(16,24,40,0.35)]"
        />
        {q.trim() && (
          <button
            type="submit"
            disabled={searching}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full bg-neutral-900/90 px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:bg-neutral-900 disabled:opacity-50"
          >
            {searching ? "搜索中…" : "搜索"}
          </button>
        )}
      </form>

      {searchError && <p className="-mt-6 text-sm text-red-600">{searchError}</p>}

      {result ? (
        <SearchResults result={result} count={resultCount} onClear={() => { setQ(""); setResult(null); }} />
      ) : (
        <section className="flex flex-col gap-5">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">科目总览</h1>
              <p className="mt-1 text-sm text-neutral-500">章节由 AI 从上传的资料里自动识别，无需手动创建。</p>
            </div>
            <Link
              href="/materials"
              className="text-sm text-neutral-500 transition-colors hover:text-neutral-900"
            >
              上传资料 →
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {subjects.map((subject, i) => (
              <Link
                key={subject.id}
                href={`/subjects/${subject.id}`}
                className="surface surface-interactive animate-fade-up group flex flex-col gap-4 rounded-2xl p-5"
                style={{ animationDelay: `${60 + i * 50}ms` }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-900/[0.06] text-xs font-semibold text-neutral-600 uppercase">
                    {monogram(subject.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold tracking-tight">{subject.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Stat>{subject.chapters.length} 章</Stat>
                      <Stat>{subject.materialCount} 份资料</Stat>
                      <Stat>{subject.questionCount} 道题</Stat>
                    </div>
                  </div>
                  <span className="text-neutral-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-neutral-500">
                    →
                  </span>
                </div>

                {subject.chapters.length === 0 ? (
                  <p className="text-sm text-neutral-400">还没有识别出章节，上传讲义后自动生成。</p>
                ) : (
                  <ul className="flex flex-col gap-1.5 border-t border-neutral-900/[0.06] pt-3">
                    {subject.chapters.slice(0, 3).map((ch, idx) => (
                      <li key={ch.id} className="flex gap-2.5 text-sm text-neutral-600">
                        <span className="w-4 shrink-0 text-right text-xs text-neutral-300 tabular-nums">
                          {idx + 1}
                        </span>
                        <span className="truncate">{ch.name}</span>
                      </li>
                    ))}
                    {subject.chapters.length > 3 && (
                      <li className="pl-[26px] text-sm text-neutral-400">
                        还有 {subject.chapters.length - 3} 章…
                      </li>
                    )}
                  </ul>
                )}
              </Link>
            ))}

            <div
              className="animate-fade-up flex items-center gap-2 rounded-2xl border border-dashed border-neutral-900/15 p-3 transition-colors hover:border-neutral-900/30"
              style={{ animationDelay: `${60 + subjects.length * 50}ms` }}
            >
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addSubject();
                }}
                placeholder="新建科目，例如：ECE 356"
                className="min-w-0 flex-1 rounded-xl border border-white/70 bg-white/50 px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:bg-white/80"
              />
              <button
                onClick={addSubject}
                disabled={creating || !newSubject.trim()}
                className="shrink-0 rounded-xl bg-neutral-900/90 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-neutral-900 disabled:opacity-30"
              >
                {creating ? "创建中…" : "创建"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SearchResults({
  result,
  count,
  onClear,
}: {
  result: SearchResult;
  count: number;
  onClear: () => void;
}) {
  return (
    <div className="animate-fade-up flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">找到 {count} 条结果</p>
        <button onClick={onClear} className="text-sm text-neutral-500 transition-colors hover:text-neutral-900">
          清除搜索
        </button>
      </div>

      <ResultSection title="知识点" empty={result.knowledgePoints.length === 0}>
        {result.knowledgePoints.map((kp) => (
          <Link
            key={kp.id}
            href={`/materials/${kp.material.id}`}
            className="surface surface-interactive block rounded-xl px-4 py-3"
          >
            <div className="font-medium">{kp.title}</div>
            <div className="line-clamp-2 text-sm text-neutral-600">{kp.content}</div>
            <div className="mt-1.5 text-xs text-neutral-400">
              来自 {kp.material.filename}
              {kp.sourcePage != null ? ` · 第 ${kp.sourcePage} 页` : ""}
            </div>
          </Link>
        ))}
      </ResultSection>

      <ResultSection title="题目" empty={result.questions.length === 0}>
        {result.questions.map((question) => (
          <Link
            key={question.id}
            href={question.material ? `/materials/${question.material.id}` : "#"}
            className="surface surface-interactive block rounded-xl px-4 py-3"
          >
            <div className="font-medium">{question.stem}</div>
            <div className="mt-1.5 text-xs text-neutral-400">
              {question.material ? `来自 ${question.material.filename}` : "自建题目"}
              {question.sourcePage != null ? ` · 第 ${question.sourcePage} 页` : ""}
            </div>
          </Link>
        ))}
      </ResultSection>

      <ResultSection title="资料" empty={result.materials.length === 0}>
        {result.materials.map((m) => (
          <Link
            key={m.id}
            href={`/materials/${m.id}`}
            className="surface surface-interactive block rounded-xl px-4 py-3 text-sm font-medium"
          >
            {m.filename}
          </Link>
        ))}
      </ResultSection>

      <p className="text-xs text-neutral-400">
        目前是关键词全文搜索（SQLite LIKE），语义搜索会在迁移到 Postgres + pgvector 后加入。
      </p>
    </div>
  );
}

// Course names are usually "<code> <number>" (ECE 356) — the number is what
// actually distinguishes them, so prefer it over the shared letter prefix.
function monogram(name: string) {
  const digits = name.match(/\d+/)?.[0];
  if (digits) return digits.slice(-3);
  return name.replace(/[^a-zA-Z0-9一-龥]/g, "").slice(0, 2);
}

function Stat({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-neutral-900/[0.05] px-2 py-0.5 text-xs text-neutral-500">{children}</span>
  );
}

function ResultSection({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  if (empty) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
