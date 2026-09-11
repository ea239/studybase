"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/labels";

export type BrowserMaterial = {
  id: string;
  filename: string;
  status: string;
  category: string;
  fileType: string;
  errorMessage: string | null;
  subject: { id: string; name: string } | null;
  chapter: { id: string; name: string } | null;
  _count: { knowledgePoints: number; questions: number; pages: number };
};

const UNSORTED = "__unsorted__";

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5">
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  );
}

// Status shown as a coloured dot rather than a second pill — the material chip
// is already a pill, and nesting one inside another reads as clutter.
function StatusDot({ status }: { status: string }) {
  const tone =
    status === "DONE"
      ? "bg-green-500"
      : status === "FAILED"
        ? "bg-red-500"
        : status === "NEEDS_REVIEW"
          ? "bg-amber-500"
          : "bg-neutral-400 animate-pulse";
  return <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone}`} />;
}

function PreviewModal({ material, onClose }: { material: BrowserMaterial; onClose: () => void }) {
  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label={material.filename}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-900/50 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85vh] w-[min(1000px,92vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-900/[0.07] px-4 py-2.5">
          <span className="truncate text-sm font-medium">{material.filename}</span>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/materials/${material.id}`}
              className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-900/[0.05] hover:text-neutral-900"
            >
              查看解析结果
            </Link>
            <a
              href={`/api/materials/${material.id}/file`}
              download={material.filename}
              className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-900/[0.05] hover:text-neutral-900"
            >
              下载
            </a>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="rounded-lg px-2 py-1 text-neutral-400 transition-colors hover:bg-neutral-900/[0.05] hover:text-neutral-900"
            >
              ✕
            </button>
          </div>
        </div>
        <iframe
          src={`/api/materials/${material.id}/file`}
          title={material.filename}
          className="min-h-0 flex-1 bg-neutral-100"
          // Only uploaded HTML is untrusted and needs the empty (fully
          // restrictive) sandbox — the file route sandboxes it via CSP too. A
          // PDF is rendered by the browser's own viewer, which an empty
          // sandbox blocks outright ("This page has been blocked by Chrome").
          sandbox={material.fileType === "HTML" ? "" : undefined}
        />
      </div>
    </div>,
    document.body
  );
}

export function MaterialsBrowser({ materials }: { materials: BrowserMaterial[] }) {
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [preview, setPreview] = useState<BrowserMaterial | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; items: BrowserMaterial[] }>();
    for (const m of materials) {
      const id = m.subject?.id ?? UNSORTED;
      const entry = map.get(id) ?? { id, name: m.subject?.name ?? "未分类", items: [] };
      entry.items.push(m);
      map.set(id, entry);
    }
    return [...map.values()].sort((a, b) =>
      a.id === UNSORTED ? 1 : b.id === UNSORTED ? -1 : a.name.localeCompare(b.name)
    );
  }, [materials]);

  const active = groups.find((g) => g.id === openSubject);

  if (materials.length === 0) {
    return <p className="text-sm text-neutral-500">还没有上传任何资料。</p>;
  }

  // Drilled into one subject: its files as chips.
  if (active) {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => setOpenSubject(null)}
          className="w-fit text-xs text-neutral-400 transition-colors hover:text-neutral-700"
        >
          ← 全部科目
        </button>
        <h2 className="text-lg font-semibold tracking-tight">{active.name}</h2>

        <div className="flex flex-wrap gap-2">
          {active.items.map((m, i) => (
            <div
              key={m.id}
              className="surface surface-interactive animate-fade-up flex items-center gap-2.5 rounded-full py-2 pr-2 pl-4"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <button onClick={() => setPreview(m)} className="flex min-w-0 items-center gap-2.5 text-left">
                <StatusDot status={m.status} />
                <span className="max-w-[18rem] truncate text-sm text-neutral-800">{m.filename}</span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {STATUS_LABELS[m.status]?.text ?? m.status}
                </span>
                {m.category !== "NOTES" && CATEGORY_LABELS[m.category] && (
                  <span className="shrink-0 text-xs text-neutral-400">
                    · {CATEGORY_LABELS[m.category].text}
                  </span>
                )}
              </button>
              <a
                href={`/api/materials/${m.id}/file`}
                download={m.filename}
                onClick={(e) => e.stopPropagation()}
                aria-label={`下载 ${m.filename}`}
                title="下载"
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-800"
              >
                <DownloadIcon />
              </a>
            </div>
          ))}
        </div>

        {active.items.some((m) => m.errorMessage) && (
          <ul className="flex flex-col gap-1">
            {active.items
              .filter((m) => m.errorMessage)
              .map((m) => (
                <li key={m.id} className="text-xs text-amber-700">
                  {m.filename}：{m.errorMessage}
                </li>
              ))}
          </ul>
        )}

        {preview && <PreviewModal material={preview} onClose={() => setPreview(null)} />}
      </div>
    );
  }

  // Top level: one card per subject.
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g, i) => {
        const pending = g.items.filter((m) => m.status === "PENDING" || m.status === "PROCESSING").length;
        const review = g.items.filter((m) => m.status === "NEEDS_REVIEW" || m.status === "FAILED").length;
        return (
          <button
            key={g.id}
            onClick={() => setOpenSubject(g.id)}
            className="surface surface-interactive animate-fade-up flex flex-col gap-3 rounded-2xl p-5 text-left"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">{g.name}</h2>
              <span className="shrink-0 text-xs text-neutral-400">{g.items.length} 份</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pending > 0 && (
                <span className="rounded-full bg-neutral-900/[0.05] px-2 py-0.5 text-xs text-neutral-500">
                  {pending} 份解析中
                </span>
              )}
              {review > 0 && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
                  {review} 份待确认
                </span>
              )}
              {pending === 0 && review === 0 && (
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-700">全部已完成</span>
              )}
            </div>
            <ul className="flex flex-col gap-1 border-t border-neutral-900/[0.06] pt-3">
              {g.items.slice(0, 3).map((m) => (
                <li key={m.id} className="truncate text-sm text-neutral-600">
                  {m.filename}
                </li>
              ))}
              {g.items.length > 3 && (
                <li className="text-sm text-neutral-400">还有 {g.items.length - 3} 份…</li>
              )}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
