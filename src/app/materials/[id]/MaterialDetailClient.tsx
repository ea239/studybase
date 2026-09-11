"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { CATEGORY_LABELS, DIFFICULTY_LABELS, STRUCTURED_TAG_LABELS } from "@/lib/labels";

type KnowledgePoint = {
  id: string;
  title: string;
  content: string;
  sourcePage: number | null;
  tags: string | null;
  isAiGenerated: boolean;
  confidence: number | null;
};
type Question = {
  id: string;
  stem: string;
  options: string | null;
  answer: string;
  explanation: string | null;
  sourcePage: number | null;
  difficulty: string;
  isAiGenerated: boolean;
  confidence: number | null;
};
type Page = { id: string; pageNumber: number; rawText: string };
type Material = {
  id: string;
  filename: string;
  status: string;
  category: string;
  errorMessage: string | null;
  summary: string | null;
  subject: { name: string } | null;
  chapter: { name: string } | null;
  pages: Page[];
  knowledgePoints: KnowledgePoint[];
  questions: Question[];
};

export function MaterialDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [material, setMaterial] = useState<Material | null>(null);
  const [tab, setTab] = useState<"knowledge" | "questions" | "raw">("knowledge");

  const load = useCallback(async () => {
    const res = await fetch(`/api/materials/${id}`);
    if (res.ok) setMaterial(await res.json());
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  useEffect(() => {
    if (!material) return;
    if (material.status === "PENDING" || material.status === "PROCESSING") {
      const t = setInterval(load, 3000);
      return () => clearInterval(t);
    }
  }, [material, load]);

  async function reprocess() {
    await fetch(`/api/materials/${id}/reprocess`, { method: "POST" });
    load();
  }

  async function remove() {
    if (!confirm("确认删除这份资料吗？原文件、知识点和题目都会被删除。")) return;
    await fetch(`/api/materials/${id}`, { method: "DELETE" });
    router.push("/materials");
  }

  if (!material) return <p className="text-sm text-neutral-500">加载中…</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{material.filename}</h1>
            {material.category !== "NOTES" && CATEGORY_LABELS[material.category] && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_LABELS[material.category].className}`}
              >
                {CATEGORY_LABELS[material.category].text}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500">
            {material.subject?.name ?? "未分类"}
            {material.chapter ? ` · ${material.chapter.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={material.status} />
          <a
            href={`/api/materials/${id}/file`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-neutral-200/80 bg-white/60 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            查看原文
          </a>
          <button
            onClick={reprocess}
            className="rounded-lg border border-neutral-200/80 bg-white/60 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            重新处理
          </button>
          <button
            onClick={remove}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            删除
          </button>
        </div>
      </div>

      {material.errorMessage && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{material.errorMessage}</div>
      )}

      {material.summary && (
        <div className="surface rounded-xl p-4">
          <h2 className="mb-1 font-semibold">摘要</h2>
          <p className="text-sm text-neutral-700">{material.summary}</p>
        </div>
      )}

      {(() => {
        const isStructured = material.category === "OVERVIEW" || material.category === "LAB";
        const knowledgeTabLabel = material.category === "LAB" ? "实验信息" : material.category === "OVERVIEW" ? "课程信息" : "知识点";
        return (
          <>
            <div className="flex gap-1 border-b border-neutral-200">
              <TabButton active={tab === "knowledge"} onClick={() => setTab("knowledge")}>
                {knowledgeTabLabel} ({material.knowledgePoints.length})
              </TabButton>
              {!isStructured && (
                <TabButton active={tab === "questions"} onClick={() => setTab("questions")}>
                  题目 ({material.questions.length})
                </TabButton>
              )}
              <TabButton active={tab === "raw"} onClick={() => setTab("raw")}>
                原文（{material.pages.length} 页）
              </TabButton>
            </div>

            {tab === "knowledge" &&
              (isStructured ? (
                <StructuredList items={material.knowledgePoints} onChanged={load} />
              ) : (
                <KnowledgeList items={material.knowledgePoints} onChanged={load} />
              ))}
            {tab === "questions" && !isStructured && <QuestionList items={material.questions} onChanged={load} />}
            {tab === "raw" && <RawPages pages={material.pages} />}
          </>
        );
      })()}
    </div>
  );
}

function TabButton({
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
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
        active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

function ConfidenceTag({ confidence, isAiGenerated }: { confidence: number | null; isAiGenerated: boolean }) {
  if (!isAiGenerated) return <span className="text-xs text-neutral-500">已人工编辑</span>;
  if (confidence == null) return null;
  const low = confidence < 0.6;
  return (
    <span className={`text-xs ${low ? "text-amber-700" : "text-neutral-400"}`}>
      AI 置信度 {(confidence * 100).toFixed(0)}%
    </span>
  );
}

const STRUCTURED_TAG_ORDER = ["basic-info", "schedule", "lab-info", "requirement", "grading", "deadline"];

function StructuredList({ items, onChanged }: { items: KnowledgePoint[]; onChanged: () => void }) {
  async function remove(itemId: string) {
    await fetch(`/api/knowledge-points/${itemId}`, { method: "DELETE" });
    onChanged();
  }

  if (items.length === 0) return <p className="text-sm text-neutral-500">暂无内容。</p>;

  const groups = new Map<string, KnowledgePoint[]>();
  for (const item of items) {
    const tag = item.tags?.split(",").find((t) => STRUCTURED_TAG_ORDER.includes(t)) ?? "other";
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag)!.push(item);
  }
  const orderedTags = [...STRUCTURED_TAG_ORDER, "other"].filter((t) => groups.has(t));

  return (
    <div className="flex flex-col gap-5">
      {orderedTags.map((tag) => (
        <div key={tag}>
          <h3 className="mb-2 text-sm font-semibold text-neutral-600">
            {STRUCTURED_TAG_LABELS[tag] ?? "其他"}
          </h3>
          <div className="flex flex-col gap-2">
            {groups.get(tag)!.map((item) => (
              <div key={item.id} className="surface rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-sm text-neutral-700">{item.content}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.sourcePage != null && (
                      <span className="text-xs text-neutral-400">第 {item.sourcePage} 页</span>
                    )}
                    <ConfidenceTag confidence={item.confidence} isAiGenerated={item.isAiGenerated} />
                  </div>
                </div>
                <button
                  onClick={() => remove(item.id)}
                  className="mt-1 text-xs text-red-600 hover:underline"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KnowledgeList({ items, onChanged }: { items: KnowledgePoint[]; onChanged: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  async function save(item: KnowledgePoint, title: string, content: string) {
    await fetch(`/api/knowledge-points/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    setEditingId(null);
    onChanged();
  }

  async function remove(itemId: string) {
    await fetch(`/api/knowledge-points/${itemId}`, { method: "DELETE" });
    onChanged();
  }

  if (items.length === 0) return <p className="text-sm text-neutral-500">暂无知识点。</p>;

  return (
    <div className="flex flex-col gap-3">
      {items.map((kp) =>
        editingId === kp.id ? (
          <EditKnowledgeCard key={kp.id} item={kp} onCancel={() => setEditingId(null)} onSave={save} />
        ) : (
          <div key={kp.id} className="surface rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{kp.title}</h3>
              <div className="flex shrink-0 items-center gap-2">
                {kp.sourcePage != null && <span className="text-xs text-neutral-400">第 {kp.sourcePage} 页</span>}
                <ConfidenceTag confidence={kp.confidence} isAiGenerated={kp.isAiGenerated} />
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{kp.content}</p>
            {kp.tags && (
              <div className="mt-2 flex flex-wrap gap-1">
                {kp.tags.split(",").filter(Boolean).map((tag) => (
                  <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => setEditingId(kp.id)} className="text-blue-600 hover:underline">
                编辑
              </button>
              <button onClick={() => remove(kp.id)} className="text-red-600 hover:underline">
                删除
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function EditKnowledgeCard({
  item,
  onCancel,
  onSave,
}: {
  item: KnowledgePoint;
  onCancel: () => void;
  onSave: (item: KnowledgePoint, title: string, content: string) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  return (
    <div className="rounded-lg border border-blue-300 bg-white p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-neutral-200/80 bg-white/60 px-2 py-1 text-sm font-semibold"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="mt-2 w-full rounded-lg border border-neutral-200/80 bg-white/60 px-2 py-1 text-sm"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onSave(item, title, content)}
          className="rounded-lg bg-neutral-900/90 transition-colors hover:bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
        >
          保存
        </button>
        <button onClick={onCancel} className="rounded-lg border border-neutral-200/80 bg-white/60 px-3 py-1 text-xs">
          取消
        </button>
      </div>
    </div>
  );
}

function QuestionList({ items, onChanged }: { items: Question[]; onChanged: () => void }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  async function remove(itemId: string) {
    await fetch(`/api/questions/${itemId}`, { method: "DELETE" });
    onChanged();
  }

  if (items.length === 0) return <p className="text-sm text-neutral-500">暂无题目。</p>;

  return (
    <div className="flex flex-col gap-3">
      {items.map((q) => {
        const options: string[] | null = q.options ? JSON.parse(q.options) : null;
        const isRevealed = revealed[q.id];
        return (
          <div key={q.id} className="surface rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{q.stem}</p>
              <div className="flex shrink-0 items-center gap-2">
                {q.sourcePage != null && <span className="text-xs text-neutral-400">第 {q.sourcePage} 页</span>}
                <ConfidenceTag confidence={q.confidence} isAiGenerated={q.isAiGenerated} />
              </div>
            </div>
            {options && (
              <ul className="mt-2 flex flex-col gap-1 text-sm text-neutral-700">
                {options.map((opt, i) => (
                  <li key={i}>{opt}</li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}
              </span>
              <button
                onClick={() => setRevealed((r) => ({ ...r, [q.id]: !r[q.id] }))}
                className="text-xs text-blue-600 hover:underline"
              >
                {isRevealed ? "隐藏答案" : "查看答案"}
              </button>
              <button onClick={() => remove(q.id)} className="text-xs text-red-600 hover:underline">
                删除
              </button>
            </div>
            {isRevealed && (
              <div className="mt-2 rounded-md bg-neutral-50 p-3 text-sm">
                <p>
                  <span className="font-medium">答案：</span>
                  {q.answer}
                </p>
                {q.explanation && (
                  <p className="mt-1 text-neutral-700">
                    <span className="font-medium">解析：</span>
                    {q.explanation}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RawPages({ pages }: { pages: Page[] }) {
  if (pages.length === 0) return <p className="text-sm text-neutral-500">暂无原文（可能还未处理完成）。</p>;
  return (
    <div className="flex flex-col gap-3">
      {pages.map((p) => (
        <div key={p.id} className="surface rounded-xl p-4">
          <div className="mb-1 text-xs font-medium text-neutral-400">第 {p.pageNumber} 页</div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-700">{p.rawText}</pre>
        </div>
      ))}
    </div>
  );
}
