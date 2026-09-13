"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DetailModal } from "@/components/DetailModal";

export type SourceRef = {
  materialId: string;
  materialName: string;
  sourcePage: number | null;
};

type PageData = {
  filename: string;
  fileType: "PDF" | "HTML" | "OFFICE";
  pageNumber: number;
  totalPages: number;
  rawText: string | null;
};

/**
 * Opens the page a claim came from, as the course wrote it.
 *
 * Following a citation should land on the original slide, not on this app's
 * own reading of it — the whole reason to check a source is to see what it
 * actually says. Slides render as the image of the page; a web page, which
 * has no page to render, falls back to its extracted text.
 */
export function SourceViewer({ source, onClose }: { source: SourceRef; onClose: () => void }) {
  const [data, setData] = useState<PageData | null>(null);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    if (source.sourcePage == null) return;
    let cancelled = false;
    fetch(`/api/materials/${source.materialId}/page/${source.sourcePage}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source]);

  const label = `${source.materialName}${source.sourcePage != null ? ` 第 ${source.sourcePage} 页` : ""}`;
  const imageUrl =
    source.sourcePage != null && data && data.fileType !== "HTML"
      ? `/api/materials/${source.materialId}/page-image/${source.sourcePage}`
      : null;

  return (
    <DetailModal
      title={label}
      onClose={onClose}
      actions={
        <Link
          href={`/materials/${source.materialId}`}
          className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900"
        >
          打开整份资料
        </Link>
      }
    >
      {source.sourcePage == null ? (
        <p className="py-8 text-center text-sm text-neutral-400">这条引用没有记录页码。</p>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-neutral-400">加载中…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {imageUrl && !imageBroken && (
            /* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG of unknown size */
            <img
              src={imageUrl}
              alt={label}
              onError={() => setImageBroken(true)}
              className="mx-auto w-full max-w-4xl rounded-xl border border-neutral-900/10 bg-white"
            />
          )}
          {(!imageUrl || imageBroken) && data.rawText && (
            <pre className="max-w-full overflow-x-auto rounded-xl bg-neutral-900/[0.04] p-4 text-[13px] leading-relaxed whitespace-pre-wrap text-neutral-700">
              {data.rawText}
            </pre>
          )}
          {(!imageUrl || imageBroken) && !data.rawText && (
            <p className="py-8 text-center text-sm text-neutral-400">这一页没有可显示的内容。</p>
          )}
          <p className="text-center text-xs text-neutral-400">
            {data.filename}
            {data.totalPages > 1 && ` · 第 ${data.pageNumber} / ${data.totalPages} 页`}
          </p>
        </div>
      )}
    </DetailModal>
  );
}
