"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLang, LangToggle } from "@/components/LangProvider";
import { Lightbox } from "@/components/Lightbox";
import { Markdown } from "@/components/Markdown";
import type { ChapterOverviewContent, ChapterOverviewCitation } from "@/lib/ai/chapterOverview";

type Entry = {
  materialId: string;
  materialName: string;
  item: { id: string; title: string; content: string; sourcePage: number | null };
};

type Reference = {
  num: number;
  materialId: string;
  materialName: string;
  sourcePage: number | null;
};

// Assigns each distinct (material, page) a stable footnote number in the order
// it first appears, so a source cited twice reuses one reference entry.
function buildReferences(overview: ChapterOverviewContent) {
  const refMap = new Map<string, number>();
  const refList: Reference[] = [];
  const bulletRefs = new Map<string, number[]>();

  overview.sections.forEach((section, si) => {
    section.bullets.forEach((bullet, bi) => {
      const nums: number[] = [];
      for (const src of bullet.sources) {
        const key = `${src.materialId}:${src.sourcePage ?? ""}`;
        let num = refMap.get(key);
        if (num == null) {
          num = refList.length + 1;
          refMap.set(key, num);
          refList.push({ num, materialId: src.materialId, materialName: src.materialName, sourcePage: src.sourcePage });
        }
        if (!nums.includes(num)) nums.push(num);
      }
      bulletRefs.set(`${si}:${bi}`, nums);
    });
  });

  return { refList, bulletRefs };
}

// Collapsed by default and laid out as wrapped page chips rather than one
// full-width line per citation — repeating the same filename 13 times was
// eating a third of the chapter.
function References({ refs }: { refs: Reference[] }) {
  const byMaterial = new Map<string, { name: string; refs: Reference[] }>();
  for (const r of refs) {
    const entry = byMaterial.get(r.materialId) ?? { name: r.materialName, refs: [] };
    entry.refs.push(r);
    byMaterial.set(r.materialId, entry);
  }

  return (
    <details className="group mt-1 border-t border-neutral-900/10 pt-3">
      <summary className="cursor-pointer list-none text-xs text-neutral-400 transition-colors hover:text-neutral-600">
        <span className="group-open:hidden">{refs.length} 处引用 · 展开</span>
        <span className="hidden group-open:inline">收起引用</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {[...byMaterial].map(([materialId, { name, refs: list }]) => (
          <div key={materialId} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
            <Link
              href={`/materials/${materialId}`}
              className="text-neutral-500 transition-colors hover:text-blue-600"
            >
              {name}
            </Link>
            {list.map((r) => (
              <span
                key={r.num}
                id={`ref-${r.num}`}
                className="rounded bg-neutral-900/[0.05] px-1.5 py-0.5 text-neutral-500 tabular-nums"
              >
                [{r.num}] {r.sourcePage != null ? `p${r.sourcePage}` : "—"}
              </span>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

// Shows the slide behind one bullet, inline right after it — the point being
// explained sits next to its own diagram instead of a pile of slides landing
// at the end of the section.
/**
 * Splits a bullet into prose and the display formulas embedded in it.
 *
 * `$$…$$` sitting mid-sentence is parsed as inline maths, which squeezes the
 * formula into the line instead of giving it the panel it deserves. Pulling it
 * out and rendering it on its own is what makes it a display formula.
 */
function splitDisplayMath(text: string): { type: "text" | "math"; value: string }[] {
  const parts: { type: "text" | "math"; value: string }[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: "text", value: text.slice(last, match.index) });
    parts.push({ type: "math", value: match[1].trim() });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.filter((p) => p.value.trim());
}

// Citations belong at the end of the words, not after a formula panel.
function lastTextIndex(parts: { type: "text" | "math" }[]) {
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].type === "text") return i;
  return -1;
}

function BulletFigure({ source }: { source: ChapterOverviewCitation }) {
  const [broken, setBroken] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  if (broken || source.sourcePage == null) return null;

  const url = `/api/materials/${source.materialId}/page-image/${source.sourcePage}`;
  const label = `${source.materialName} 第 ${source.sourcePage} 页`;

  return (
    <div className="mt-2 mb-1">
      <button
        onClick={() => setZoomed(true)}
        title={label}
        className="surface surface-interactive block overflow-hidden rounded-lg p-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG of unknown size, not a static asset */}
        <img
          src={url}
          alt={label}
          loading="lazy"
          onError={() => setBroken(true)}
          className="max-h-64 w-auto object-contain"
        />
      </button>

      {zoomed && <Lightbox src={url} alt={label} onClose={() => setZoomed(false)} />}
    </div>
  );
}

export default function ChapterReader({
  chapterId,
  chapterName,
  initialOverview,
  initialGeneratedAt,
  entries,
}: {
  chapterId: string | null;
  chapterName: string;
  initialOverview: ChapterOverviewContent | null;
  initialGeneratedAt: string | null;
  entries: Entry[];
}) {
  const { lang } = useLang();
  const [overview, setOverview] = useState(initialOverview);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { refList, bulletRefs } = useMemo(
    () => (overview ? buildReferences(overview) : { refList: [], bulletRefs: new Map<string, number[]>() }),
    [overview]
  );

  async function generate() {
    if (!chapterId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/overview`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      setOverview(data.overview);
      setGeneratedAt(data.overviewGeneratedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        {/* flex-wrap + min-w-0: an h1 in a flex row defaults to min-width:auto
            and refuses to shrink below its longest word, which pushed the
            (shrink-0) language toggle off-screen on phone widths. */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h1 className="min-w-0 flex-1 text-[26px] leading-tight font-semibold tracking-tight break-words text-neutral-900">
            {chapterName}
          </h1>
          {/* Only meaningful where bilingual notes exist — the raw
              knowledge-point fallback below is single-language. */}
          {overview && (
            <div className="mt-1 shrink-0">
              <LangToggle />
            </div>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-400">
          <span>共 {entries.length} 个知识点</span>
          {generatedAt && <span>上次生成于 {new Date(generatedAt).toLocaleString()}</span>}
          {chapterId && (
            <button
              onClick={generate}
              disabled={loading}
              className="surface surface-interactive rounded-full px-3 py-1 text-xs text-neutral-600 disabled:opacity-50"
            >
              {loading ? "生成中…" : overview ? "重新生成笔记" : "生成本章笔记"}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {overview ? (
        <div className="flex max-w-[78ch] flex-col gap-7">
          {overview.sections.map((section, si) => (
            <section key={si} className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900">
                <Markdown inline>{section.heading[lang]}</Markdown>
              </h2>
              <ul className="flex flex-col gap-2">
                {section.bullets.map((bullet, bi) => {
                  const nums = bulletRefs.get(`${si}:${bi}`) ?? [];
                  const parts = splitDisplayMath(bullet.text[lang]);
                  const lastText = lastTextIndex(parts);
                  // A bullet that is nothing but a formula gets no marker: the
                  // panel is the point, and a dot beside an empty line reads
                  // as a bullet whose text failed to load.
                  const formulaOnly = lastText === -1;
                  return (
                    <li
                      key={bi}
                      className={`flex gap-2.5 text-[15px] leading-[1.7] text-neutral-700 ${formulaOnly ? "mt-1" : ""}`}
                    >
                      {!formulaOnly && (
                        <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-neutral-400" />
                      )}
                      <div className="min-w-0">
                        <span data-quotable>
                          {(() => {
                            const refs = nums.map((num) => (
                              <sup key={num} className="ml-0.5">
                                <a href={`#ref-${num}`} className="text-blue-600 hover:underline">
                                  [{num}]
                                </a>
                              </sup>
                            ));
                            return (
                              <>
                                {parts.map((part: { type: "text" | "math"; value: string }, pi: number) =>
                                  part.type === "math" ? (
                                    // The citation rides alongside the panel
                                    // rather than dropping to a line of its own.
                                    <span key={pi} className="flex items-start gap-1">
                                      <Markdown>{`$$\n${part.value}\n$$`}</Markdown>
                                      {formulaOnly && pi === parts.length - 1 && (
                                        <span className="mt-3">{refs}</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span key={pi}>
                                      <Markdown inline>{part.value}</Markdown>
                                      {pi === lastText && refs}
                                    </span>
                                  )
                                )}

                              </>
                            );
                          })()}
                        </span>
                        {bullet.figure && bullet.sources[0] && <BulletFigure source={bullet.sources[0]} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {refList.length > 0 && <References refs={refList} />}
        </div>
      ) : (
        <div className="flex max-w-[78ch] flex-col gap-4">
          {chapterId && (
            <div className="surface flex flex-col items-start gap-2 rounded-xl p-4">
              <p className="text-sm font-medium text-neutral-900">本章还没有生成笔记</p>
              <p className="text-xs leading-relaxed text-neutral-500">
                生成后，下面这 {entries.length} 个知识点会被整理成分节的复习笔记，并附上中英双语——届时这里会出现语言切换按钮。
              </p>
              <button
                onClick={generate}
                disabled={loading}
                className="rounded-lg bg-neutral-900/90 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-900 disabled:opacity-40"
              >
                {loading ? "生成中…" : "生成本章笔记"}
              </button>
            </div>
          )}
          <p className="text-xs text-neutral-400">以下是从资料里提取的原始知识点：</p>
          {entries.map(({ materialId, materialName, item }) => (
            <div key={item.id}>
              <div className="text-sm font-medium text-neutral-900">{item.title}</div>
              <p className="text-[15px] leading-[1.7] text-neutral-700" data-quotable>
                {item.content}
              </p>
              <Link
                href={`/materials/${materialId}`}
                className="text-xs text-neutral-400 hover:text-blue-600 hover:underline"
              >
                来自 {materialName}
                {item.sourcePage != null ? ` 第 ${item.sourcePage} 页` : ""} →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
