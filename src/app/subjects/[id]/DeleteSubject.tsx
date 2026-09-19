"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DetailModal } from "@/components/DetailModal";

type Summary = {
  name: string;
  materials: number;
  chapters: number;
  events: number;
  knowledgePoints: number;
  questions: number;
  learnCourses: number;
};

export function DeleteSubject({ subjectId, subjectName }: { subjectId: string; subjectName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setOpen(true);
    setTyped("");
    setError(null);
    setSummary(null);
    // Counted now rather than shown as a generic warning: "this deletes 26
    // files and 130 questions" is a decision, "this cannot be undone" is not.
    const res = await fetch(`/api/subjects/${subjectId}`, { method: "OPTIONS" });
    if (res.ok) setSummary(await res.json());
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/subjects/${subjectId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "删除失败");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  const rows = summary
    ? ([
        ["资料文件", summary.materials],
        ["章节", summary.chapters],
        ["知识点", summary.knowledgePoints],
        ["题目", summary.questions],
        ["日程与作业", summary.events],
      ] as const).filter(([, n]) => n > 0)
    : [];

  return (
    <>
      <button
        onClick={start}
        className="w-fit rounded-lg px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-700"
      >
        删除这门课
      </button>

      {open && (
        <DetailModal title={`删除 ${subjectName}`} onClose={() => !busy && setOpen(false)}>
          <div className="flex max-w-[42rem] flex-col gap-4">
            <p className="text-sm text-neutral-800">
              这会永久删除 <span className="font-medium">{subjectName}</span> 及其全部内容，包括磁盘上的原始文件。此操作无法撤销。
            </p>

            {summary === null ? (
              <p className="text-sm text-neutral-400">正在统计…</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1 rounded-xl bg-red-500/[0.06] p-3 text-sm text-neutral-700">
                  {rows.length === 0 ? (
                    <li className="text-neutral-500">这门课目前没有任何内容。</li>
                  ) : (
                    rows.map(([label, n]) => (
                      <li key={label} className="flex justify-between gap-4">
                        <span className="text-neutral-500">{label}</span>
                        <span className="tabular-nums">{n}</span>
                      </li>
                    ))
                  )}
                </ul>

                {summary.learnCourses > 0 && (
                  <p className="text-xs text-neutral-500">
                    对应的 LEARN 课程会同时停止自动同步，否则下次同步会把这些资料重新拉回来。之后想恢复，在设置页重新勾选即可。
                  </p>
                )}

                <label className="flex flex-col gap-1.5 text-sm">
                  输入课程名 <code className="inline rounded bg-neutral-900/[0.06] px-1">{subjectName}</code> 以确认：
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={subjectName}
                    className="rounded-lg border border-neutral-900/15 bg-white/60 px-3 py-2"
                  />
                </label>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex items-center gap-2">
                  <button
                    onClick={remove}
                    disabled={busy || typed.trim() !== subjectName}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white transition-opacity hover:opacity-85 disabled:opacity-35"
                  >
                    {busy ? "正在删除…" : "永久删除"}
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    disabled={busy}
                    className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
                  >
                    取消
                  </button>
                </div>
              </>
            )}
          </div>
        </DetailModal>
      )}
    </>
  );
}
