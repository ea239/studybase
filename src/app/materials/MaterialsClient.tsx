"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS } from "@/lib/fileTypes";
import Link from "next/link";
import { MaterialsBrowser } from "./MaterialsBrowser";

// One row of the upload progress list. `status` mirrors the server's
// MaterialStatus once uploaded; the two extra values cover the client-side
// window before a material row exists.
type BatchItem = {
  name: string;
  id: string | null;
  status: "UPLOADING" | "UPLOAD_FAILED" | "PENDING" | "PROCESSING" | "DONE" | "NEEDS_REVIEW" | "FAILED";
  error?: string;
};

const BATCH_LABELS: Record<BatchItem["status"], string> = {
  UPLOADING: "上传中…",
  UPLOAD_FAILED: "上传失败",
  PENDING: "排队中",
  PROCESSING: "解析中…",
  DONE: "已完成",
  NEEDS_REVIEW: "需人工确认",
  FAILED: "解析失败",
};

const FINISHED: BatchItem["status"][] = ["DONE", "NEEDS_REVIEW", "FAILED", "UPLOAD_FAILED"];

type Chapter = { id: string; name: string };
type Subject = { id: string; name: string; chapters: Chapter[] };
type Material = {
  id: string;
  filename: string;
  status: string;
  category: string;
  fileType: string;
  errorMessage: string | null;
  createdAt: string;
  subject: { id: string; name: string } | null;
  chapter: { id: string; name: string } | null;
  _count: { knowledgePoints: number; questions: number; pages: number };
};

function BatchProgress({ batch, onDismiss }: { batch: BatchItem[]; onDismiss: () => void }) {
  const done = batch.filter((b) => FINISHED.includes(b.status)).length;
  const allDone = done === batch.length;
  const pct = Math.round((done / batch.length) * 100);

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-neutral-900/[0.08] bg-white/50 p-3.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {allDone ? "全部处理完成" : "正在处理"} {done}/{batch.length}
        </span>
        {allDone && (
          <button onClick={onDismiss} className="text-xs text-neutral-400 transition-colors hover:text-neutral-700">
            关闭
          </button>
        )}
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-neutral-900/[0.08]">
        <div
          className="h-full rounded-full bg-neutral-900/70 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="flex flex-col gap-1">
        {batch.map((item, i) => {
          const failed = item.status === "FAILED" || item.status === "UPLOAD_FAILED";
          const active = item.status === "PROCESSING" || item.status === "UPLOADING";
          return (
            <li key={i} className="flex items-baseline gap-2 text-xs">
              <span className="w-4 shrink-0 text-right text-neutral-300 tabular-nums">{i + 1}</span>
              <span className={`min-w-0 flex-1 truncate ${active ? "text-neutral-900" : "text-neutral-600"}`}>
                {item.name}
              </span>
              <span
                className={`shrink-0 ${
                  failed ? "text-red-600" : item.status === "DONE" ? "text-green-700" : "text-neutral-400"
                }`}
              >
                {BATCH_LABELS[item.status]}
              </span>
            </li>
          );
        })}
      </ul>

      {batch.some((b) => b.error) && (
        <ul className="flex flex-col gap-0.5">
          {batch
            .filter((b) => b.error)
            .map((b, i) => (
              <li key={i} className="text-xs text-amber-700">
                {b.name}：{b.error}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export function MaterialsClient({
  subjects,
  initialSubjectId,
}: {
  subjects: Subject[];
  initialSubjectId?: string;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [uploadSubjectId, setUploadSubjectId] = useState(initialSubjectId ?? "");
  const [uploadChapterId, setUploadChapterId] = useState("");
  const [uploadCategory, setUploadCategory] = useState<"NOTES" | "OVERVIEW" | "LAB">("NOTES");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMaterials = useCallback(async () => {
    try {
      // No filter params: the browser below groups by subject itself.
      const res = await fetch("/api/materials");
      if (!res.ok) throw new Error(`服务返回 ${res.status}`);
      setMaterials(await res.json());
      setListError(null);
    } catch (err) {
      // Without this the list would sit on "加载中…" forever — e.g. if the
      // request lands while the dev server is restarting.
      setListError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  // Poll while anything is still pending/processing, so status updates
  // without the user having to refresh manually. Also retries after a failed
  // load, so a request that lost the server recovers on its own.
  useEffect(() => {
    const hasActive = materials.some((m) => m.status === "PENDING" || m.status === "PROCESSING");
    if (!hasActive && !listError) return;
    const t = setInterval(loadMaterials, 3000);
    return () => clearInterval(t);
  }, [materials, listError, loadMaterials]);

  // Poll the batch by id, independent of the list filters below — a file
  // uploaded under a different subject still needs to report its progress.
  const batchIds = batch
    .map((b) => b.id)
    .filter((id): id is string => id != null)
    .join(",");
  const batchActive = batch.some((b) => !FINISHED.includes(b.status));

  useEffect(() => {
    if (!batchIds || !batchActive) return;
    let cancelled = false;
    const tick = async () => {
      let rows: Material[];
      try {
        const res = await fetch(`/api/materials?ids=${batchIds}`);
        if (!res.ok) return; // transient — the next tick retries
        rows = await res.json();
      } catch {
        return;
      }
      if (cancelled) return;
      const byId = new Map(rows.map((r) => [r.id, r]));
      setBatch((b) =>
        b.map((item) => {
          if (!item.id) return item;
          const row = byId.get(item.id);
          // Row vanished (deleted elsewhere) — settle it instead of leaving the
          // item polling a material that will never report again.
          if (!row) return { ...item, status: "FAILED", error: "资料已不存在" };
          return { ...item, status: row.status as BatchItem["status"], error: row.errorMessage ?? undefined };
        })
      );
      loadMaterials();
    };
    const t = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [batchIds, batchActive, loadMaterials]);

  const selectedUploadSubject = subjects.find((s) => s.id === uploadSubjectId);

  async function handleUpload() {
    const files = Array.from(fileInputRef.current?.files ?? []);
    if (files.length === 0) {
      setUploadError("请先选择 PDF 或 HTML 文件（可多选）");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setBatch(files.map((f) => ({ name: f.name, id: null, status: "UPLOADING" })));

    // Uploaded one at a time so the list fills in visibly and the server
    // queue receives them in the order shown.
    for (const [i, file] of files.entries()) {
      const form = new FormData();
      form.append("file", file);
      form.append("category", uploadCategory);
      if (uploadSubjectId) form.append("subjectId", uploadSubjectId);
      if (uploadChapterId) form.append("chapterId", uploadChapterId);

      try {
        const res = await fetch("/api/materials", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "上传失败");
        setBatch((b) =>
          b.map((item, idx) => (idx === i ? { ...item, id: data.id, status: "PENDING" } : item))
        );
      } catch (err) {
        setBatch((b) =>
          b.map((item, idx) =>
            idx === i
              ? { ...item, status: "UPLOAD_FAILED", error: err instanceof Error ? err.message : "上传失败" }
              : item
          )
        );
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadMaterials();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="surface rounded-xl p-4">
        <h2 className="mb-3 font-semibold">上传资料</h2>
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            className="text-sm"
          />

          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="uploadCategory"
                checked={uploadCategory === "NOTES"}
                onChange={() => setUploadCategory("NOTES")}
              />
              课程资料（讲义/笔记/题目）
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="uploadCategory"
                checked={uploadCategory === "OVERVIEW"}
                onChange={() => setUploadCategory("OVERVIEW")}
              />
              课程大纲 / 评分说明 / 课表
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="uploadCategory"
                checked={uploadCategory === "LAB"}
                onChange={() => setUploadCategory("LAB")}
              />
              实验 / 作业说明
            </label>
          </div>
          {uploadCategory === "OVERVIEW" && (
            <p className="text-xs text-neutral-500">
              这类文件会按课程结构解析（基本信息、课程进度、评分占比、重要日期），而不是提取知识点和题目。
            </p>
          )}
          {uploadCategory === "LAB" && (
            <p className="text-xs text-neutral-500">
              这类文件会按任务结构解析（实验/作业信息、要求与提交方式、评分说明、截止日期），而不是提取知识点和题目。
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <select
              value={uploadSubjectId}
              onChange={(e) => {
                setUploadSubjectId(e.target.value);
                setUploadChapterId("");
              }}
              className="rounded-lg border border-neutral-200/80 bg-white/60 px-2 py-1.5 text-sm"
            >
              <option value="">不指定科目</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={uploadChapterId}
              onChange={(e) => setUploadChapterId(e.target.value)}
              disabled={!selectedUploadSubject}
              className="rounded-lg border border-neutral-200/80 bg-white/60 px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">章节（留空自动判断）</option>
              {selectedUploadSubject?.chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>
          </div>
          {subjects.length === 0 && (
            <p className="text-xs text-neutral-500">
              还没有科目，可以先去 <Link href="/" className="text-blue-600 hover:underline">科目总览</Link> 创建，也可以先不分类直接上传。
            </p>
          )}
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
          {/* Only the upload itself blocks the button. Parsing continues in a
              server-side queue, so more files can be queued meanwhile — and a
              job that never reports back can't lock the button forever. */}
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-fit rounded-lg bg-neutral-900/90 transition-colors hover:bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {uploading ? "上传中…" : "上传并自动整理"}
          </button>

          {batch.length > 0 && <BatchProgress batch={batch} onDismiss={() => setBatch([])} />}

          <p className="text-xs text-neutral-500">
            支持 PDF、HTML 网页（从浏览器另存为「网页，仅 HTML」即可）、PPT / Word 文档（先转成 PDF 再解析）、纯文本（txt / md / csv），以及图片（png / jpg 等，由识图模型读出文字和图表说明），可一次多选。文件会按选中顺序逐个解析——提取文字、生成摘要、知识点与题目；「课程资料」类不指定章节时，AI 会根据文档里出现的标题/章节号自动判断归属章节（一份文件横跨多章时，不同内容会分别归入对应章节）。
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">全部资料</h2>

        {loading ? (
          <p className="text-sm text-neutral-500">加载中…</p>
        ) : listError ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-600">加载失败：{listError}</p>
            <button
              onClick={loadMaterials}
              className="rounded-lg border border-neutral-200/80 bg-white/60 px-3 py-1 text-xs transition-colors hover:bg-white"
            >
              重试
            </button>
          </div>
        ) : (
          <MaterialsBrowser materials={materials} />
        )}
      </section>
    </div>
  );
}
