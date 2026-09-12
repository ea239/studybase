"use client";

import { useState } from "react";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import type { AssignmentBrief, BriefCitation } from "@/lib/ai/assignmentBrief";

export type WorkDetailItem = {
  id: string;
  title: string;
  kind: string;
  dueLabel: string;
  precision: "EXACT" | "RANGE" | "UNKNOWN";
  startsAt: string | null;
  completedAt: string | null;
  brief: AssignmentBrief | null;
  briefGeneratedAt: string | null;
};

function citationKey(c: BriefCitation) {
  return `${c.materialId}:${c.sourcePage ?? ""}`;
}

export function WorkDetail({ subjectId, item }: { subjectId: string; item: WorkDetailItem }) {
  const [brief, setBrief] = useState(item.brief);
  const [generatedAt, setGeneratedAt] = useState(item.briefGeneratedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Captured on mount rather than read while rendering, so the overdue mark
  // cannot flip under an unrelated re-render.
  const [now] = useState(() => Date.now());

  const overdue =
    !item.completedAt &&
    item.precision === "EXACT" &&
    item.startsAt != null &&
    new Date(item.startsAt).getTime() < now;

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/events/${item.id}/brief`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "生成失败");
    else {
      setBrief(data.brief);
      setGeneratedAt(data.briefGeneratedAt);
    }
    setBusy(false);
  }

  // One numbered reference per distinct source, in first-seen order, so the
  // same page cited from several bullets keeps one number.
  const refs: BriefCitation[] = [];
  const refNumber = new Map<string, number>();
  for (const section of brief?.sections ?? []) {
    for (const bullet of section.bullets) {
      for (const source of bullet.sources) {
        const key = citationKey(source);
        if (!refNumber.has(key)) {
          refs.push(source);
          refNumber.set(key, refs.length);
        }
      }
    }
  }

  return (
    <div className="flex max-w-[78ch] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href={`/subjects/${subjectId}?tab=work`}
          className="w-fit text-xs text-neutral-400 transition-colors hover:text-neutral-700"
        >
          ← 全部作业
        </Link>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-neutral-900">
          {item.title}
        </h1>
        <p className="text-xs text-neutral-400">
          截止 {item.dueLabel}
          {overdue && <span className="ml-1 font-medium text-red-600">· 已逾期</span>}
          {item.completedAt && <span className="ml-1 text-green-700">· 已完成</span>}
          {generatedAt && ` · 说明生成于 ${new Date(generatedAt).toLocaleString()}`}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {busy ? "正在整理…" : brief ? "重新整理" : "整理这项作业"}
        </button>
        {busy && <span className="text-xs text-neutral-400">正在翻阅课程资料…</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {brief ? (
        <div className="flex flex-col gap-6">
          <p className="text-[15px] leading-[1.7] text-neutral-800">{brief.summary}</p>

          {brief.sections.map((section, si) => (
            <section key={si} className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900">
                {section.heading}
              </h2>
              <ul className="flex flex-col gap-2">
                {section.bullets.map((bullet, bi) => (
                  <li key={bi} className="flex gap-2.5 text-[15px] leading-[1.7] text-neutral-700">
                    <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-neutral-400" />
                    <div className="min-w-0">
                      <span data-quotable>
                        <Markdown inline>{bullet.text}</Markdown>
                        {[...new Set(bullet.sources.map((s) => refNumber.get(citationKey(s))!))].map(
                          (num) => (
                            <sup key={num} className="ml-0.5">
                              <a href={`#wref-${num}`} className="text-blue-600 hover:underline">
                                [{num}]
                              </a>
                            </sup>
                          )
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {refs.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-neutral-900/[0.07] pt-3">
              <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">来源</p>
              <ol className="flex flex-col gap-1">
                {refs.map((ref, i) => (
                  <li key={i} id={`wref-${i + 1}`} className="text-xs text-neutral-500">
                    [{i + 1}]{" "}
                    <Link href={`/materials/${ref.materialId}`} className="hover:text-blue-600 hover:underline">
                      {ref.materialName}
                      {ref.sourcePage != null ? ` 第 ${ref.sourcePage} 页` : ""}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          还没有整理过。点上面的按钮，AI 会翻阅这门课的作业页面、评分标准和课程大纲，把要求、提交方式、评分和时间政策汇总到一起。
        </p>
      )}
    </div>
  );
}
