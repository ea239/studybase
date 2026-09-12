"use client";

import { useState } from "react";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";

type Source = {
  kind: "point" | "page" | "event";
  title: string;
  materialName: string;
  sourcePage: number | null;
  href: string;
};

const KIND_LABEL: Record<Source["kind"], string> = {
  point: "知识点",
  page: "原文",
  event: "日程",
};

export function SubjectSearch({ subjectId }: { subjectId: string }) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;

    setBusy(true);
    setAnswer("");
    setSources([]);
    setAsked(q);

    try {
      const res = await fetch(`/api/subjects/${subjectId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("没有返回内容");

      const decoder = new TextDecoder();
      let buffered = "";
      let headerDone = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });

        // The first line is the source list, sent before generation starts.
        if (!headerDone) {
          const newline = buffered.indexOf("\n");
          if (newline < 0) continue;
          try {
            setSources(JSON.parse(buffered.slice(0, newline)).sources ?? []);
          } catch {
            // A malformed header costs the source list, not the answer.
          }
          buffered = buffered.slice(newline + 1);
          headerDone = true;
        }
        setAnswer(buffered);
      }
    } catch (err) {
      setAnswer(`搜索失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={run} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索这门课：late policy、某个作业什么时候交、章节里的某个概念…"
          className="surface min-w-0 flex-1 rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-neutral-400"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {busy ? "搜索中…" : "搜索"}
        </button>
      </form>

      {asked && (
        <div className="surface animate-fade-up flex flex-col gap-3 rounded-2xl p-4">
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sources.slice(0, 8).map((s, i) => (
                <Link
                  key={i}
                  href={s.href}
                  title={`${s.materialName}${s.sourcePage != null ? ` 第 ${s.sourcePage} 页` : ""}`}
                  className="flex max-w-[22rem] items-center gap-1.5 rounded-full bg-neutral-900/[0.05] px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-900/[0.1] hover:text-neutral-900"
                >
                  <span className="shrink-0 text-neutral-400">[{i + 1}]</span>
                  <span className="shrink-0 text-neutral-400">{KIND_LABEL[s.kind]}</span>
                  <span className="truncate">{s.title}</span>
                </Link>
              ))}
            </div>
          )}

          {answer ? (
            <div className="text-[15px] leading-[1.7] text-neutral-800">
              <Markdown>{answer}</Markdown>
            </div>
          ) : (
            <p className="text-sm text-neutral-400">
              {sources.length > 0 ? "正在阅读这些资料…" : "正在检索…"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
