"use client";

import { useState } from "react";
import Link from "next/link";

type SearchResult = {
  materials: { id: string; filename: string }[];
  knowledgePoints: { id: string; title: string; content: string; sourcePage: number | null; material: { id: string; filename: string } }[];
  questions: { id: string; stem: string; answer: string; sourcePage: number | null; material: { id: string; filename: string } | null }[];
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">搜索</h1>
      <form onSubmit={runSearch} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索资料标题、知识点、题目…"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          搜索
        </button>
      </form>
      <p className="text-xs text-neutral-500">
        目前是关键词全文搜索（SQLite LIKE），语义搜索（例如&ldquo;为什么积分换元要变上下限&rdquo;这类问题）会在迁移到 Postgres + pgvector 后加入。
      </p>

      {result && (
        <div className="flex flex-col gap-6">
          <ResultSection title="资料" empty={result.materials.length === 0}>
            {result.materials.map((m) => (
              <Link key={m.id} href={`/materials/${m.id}`} className="block rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50">
                {m.filename}
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="知识点" empty={result.knowledgePoints.length === 0}>
            {result.knowledgePoints.map((kp) => (
              <Link
                key={kp.id}
                href={`/materials/${kp.material.id}`}
                className="block rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
              >
                <div className="font-medium">{kp.title}</div>
                <div className="text-neutral-600 line-clamp-2">{kp.content}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  来自 {kp.material.filename}
                  {kp.sourcePage != null ? ` · 第 ${kp.sourcePage} 页` : ""}
                </div>
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="题目" empty={result.questions.length === 0}>
            {result.questions.map((q) => (
              <Link
                key={q.id}
                href={q.material ? `/materials/${q.material.id}` : "#"}
                className="block rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
              >
                <div className="font-medium">{q.stem}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {q.material ? `来自 ${q.material.filename}` : "自建题目"}
                  {q.sourcePage != null ? ` · 第 ${q.sourcePage} 页` : ""}
                </div>
              </Link>
            ))}
          </ResultSection>
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {empty ? <p className="text-sm text-neutral-500">无结果</p> : <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
}
