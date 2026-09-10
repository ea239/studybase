"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";

type Chapter = { id: string; name: string };
type Course = { id: string; name: string; chapters: Chapter[] };
type Subject = { id: string; name: string; courses: Course[] };
type Material = {
  id: string;
  filename: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  subject: { id: string; name: string } | null;
  course: { id: string; name: string } | null;
  chapter: { id: string; name: string } | null;
  _count: { knowledgePoints: number; questions: number; pages: number };
};

export function MaterialsClient({
  subjects,
  initialSubjectId,
}: {
  subjects: Subject[];
  initialSubjectId?: string;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? "");
  const [courseId, setCourseId] = useState("");
  const [chapterId, setChapterId] = useState("");

  const [uploadSubjectId, setUploadSubjectId] = useState(initialSubjectId ?? "");
  const [uploadCourseId, setUploadCourseId] = useState("");
  const [uploadChapterId, setUploadChapterId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMaterials = useCallback(async () => {
    const params = new URLSearchParams();
    if (subjectId) params.set("subjectId", subjectId);
    if (courseId) params.set("courseId", courseId);
    if (chapterId) params.set("chapterId", chapterId);
    const res = await fetch(`/api/materials?${params.toString()}`);
    const data = await res.json();
    setMaterials(data);
    setLoading(false);
  }, [subjectId, courseId, chapterId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadMaterials();
  }, [loadMaterials]);

  // Poll while anything is still pending/processing, so status updates
  // without the user having to refresh manually.
  useEffect(() => {
    const hasActive = materials.some((m) => m.status === "PENDING" || m.status === "PROCESSING");
    if (!hasActive) return;
    const t = setInterval(loadMaterials, 3000);
    return () => clearInterval(t);
  }, [materials, loadMaterials]);

  const selectedUploadSubject = subjects.find((s) => s.id === uploadSubjectId);
  const selectedUploadCourse = selectedUploadSubject?.courses.find((c) => c.id === uploadCourseId);

  const filterCourse = subjects.find((s) => s.id === subjectId);
  const filterChapters = filterCourse?.courses.find((c) => c.id === courseId)?.chapters ?? [];

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError("请先选择一个 PDF 文件");
      return;
    }
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    if (uploadSubjectId) form.append("subjectId", uploadSubjectId);
    if (uploadCourseId) form.append("courseId", uploadCourseId);
    if (uploadChapterId) form.append("chapterId", uploadChapterId);

    const res = await fetch("/api/materials", { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setUploadError(data.error ?? "上传失败");
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadMaterials();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">上传资料</h2>
        <div className="flex flex-col gap-3">
          <input ref={fileInputRef} type="file" accept="application/pdf" className="text-sm" />
          <div className="flex flex-wrap gap-2">
            <select
              value={uploadSubjectId}
              onChange={(e) => {
                setUploadSubjectId(e.target.value);
                setUploadCourseId("");
                setUploadChapterId("");
              }}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">不指定科目</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={uploadCourseId}
              onChange={(e) => {
                setUploadCourseId(e.target.value);
                setUploadChapterId("");
              }}
              disabled={!selectedUploadSubject}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">不指定课程</option>
              {selectedUploadSubject?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={uploadChapterId}
              onChange={(e) => setUploadChapterId(e.target.value)}
              disabled={!selectedUploadCourse}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">不指定章节</option>
              {selectedUploadCourse?.chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>
          </div>
          {subjects.length === 0 && (
            <p className="text-xs text-neutral-500">
              还没有科目/课程/章节，可以先去 <Link href="/subjects" className="text-blue-600 hover:underline">全部科目</Link> 创建，也可以先不分类直接上传。
            </p>
          )}
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {uploading ? "上传中…" : "上传并自动整理"}
          </button>
          <p className="text-xs text-neutral-500">目前仅支持 PDF。上传后会自动提取文字、生成摘要、知识点与题目。</p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">全部资料</h2>
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setCourseId("");
              setChapterId("");
            }}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="">全部科目</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setChapterId("");
            }}
            disabled={!filterCourse}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
          >
            <option value="">全部课程</option>
            {filterCourse?.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            disabled={filterChapters.length === 0}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
          >
            <option value="">全部章节</option>
            {filterChapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">加载中…</p>
        ) : materials.length === 0 ? (
          <p className="text-sm text-neutral-500">没有符合条件的资料。</p>
        ) : (
          <div className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {materials.map((m) => (
              <Link
                key={m.id}
                href={`/materials/${m.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.filename}</div>
                  <div className="text-sm text-neutral-500">
                    {m.subject?.name ?? "未分类"}
                    {m.chapter ? ` · ${m.chapter.name}` : ""} · {m._count.pages} 页 · {m._count.knowledgePoints} 个知识点 ·{" "}
                    {m._count.questions} 道题
                  </div>
                  {m.errorMessage && <div className="text-xs text-amber-700">{m.errorMessage}</div>}
                </div>
                <StatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
