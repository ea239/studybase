"use client";

import { useCallback, useState } from "react";

type Course = {
  id: string;
  orgUnitId: string;
  name: string;
  code: string | null;
  enabled: boolean;
  subjectId: string | null;
  lastSyncedAt: string | null;
  lastResult: string | null;
};
type Subject = { id: string; name: string };
export type LearnState = {
  connected: boolean;
  stale?: boolean;
  expiresAt: string | null;
  courses: Course[];
  subjects: Subject[];
};

export function LearnSync({ initial }: { initial: LearnState }) {
  // Seeded from the server render, like Members — refetched only after an
  // action that actually changes something.
  const [state, setState] = useState<LearnState>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/learn");
    if (res.ok) setState(await res.json());
  }, []);

  async function run(action: "refresh" | "sync") {
    setBusy(action);
    setMessage(null);
    const res = await fetch("/api/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "操作失败");
    } else if (action === "refresh") {
      setMessage(`找到 ${data.count} 门课程`);
    } else {
      const reports: {
        course: string;
        imported: number;
        updated: number;
        adopted: number;
        unsupported?: string[];
        failed?: { filename: string }[];
        locked?: string[];
        error?: string;
      }[] = data.reports ?? [];
      setMessage(
        reports.length === 0
          ? "没有已启用并映射科目的课程"
          : reports
              .map((r) =>
                r.error
                  ? `${r.course}：${r.error}`
                  : `${r.course}：新增 ${r.imported}，更新 ${r.updated}，认领 ${r.adopted}` +
                    (r.unsupported?.length ? `，格式不支持 ${r.unsupported.length}` : "") +
                    (r.locked?.length ? `，尚未开放 ${r.locked.length}` : "") +
                    (r.failed?.length ? `，下载失败 ${r.failed.length}` : "")
              )
              .join("；")
      );
    }
    await load();
    setBusy(null);
  }

  async function patch(id: string, body: { enabled?: boolean; subjectId?: string | null }) {
    setBusy(id);
    await fetch("/api/learn", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    await load();
    setBusy(null);
  }

  return (
    <div className="surface flex flex-col gap-3 rounded-xl p-4">
      <div>
        <h2 className="font-semibold">LEARN 同步</h2>
        <p className="mt-1 text-sm text-neutral-500">
          从 LEARN 自动下载课件并入库。勾选课程并选好对应科目，之后每天自动同步一次。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`size-1.5 rounded-full ${state.connected ? "bg-green-500" : "bg-neutral-300"}`}
          aria-hidden
        />
        {state.connected ? (
          <span className="text-neutral-600">
            已连接
            {state.expiresAt && ` · 会话至 ${new Date(state.expiresAt).toLocaleString()}`}
          </span>
        ) : (
          <span className="text-neutral-600">
            未连接 · 在本机运行 <code className="rounded bg-neutral-900/[0.06] px-1">npm run learn:login</code>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run("refresh")}
          disabled={!state.connected || busy !== null}
          className="rounded-lg bg-neutral-900/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-neutral-900/[0.1] disabled:opacity-40"
        >
          {busy === "refresh" ? "刷新中…" : "刷新课程列表"}
        </button>
        <button
          onClick={() => run("sync")}
          disabled={!state.connected || busy !== null}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {busy === "sync" ? "同步中…" : "立即同步"}
        </button>
      </div>

      {message && <p className="text-xs text-neutral-500">{message}</p>}

      {state.courses.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-neutral-900/[0.06] pt-3">
          {state.courses.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={c.enabled}
                disabled={busy !== null}
                onChange={(e) => patch(c.id, { enabled: e.target.checked })}
                aria-label={`同步 ${c.name}`}
                className="size-3.5 shrink-0 accent-neutral-900"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-800" title={c.name}>
                {c.name}
              </span>
              <select
                value={c.subjectId ?? ""}
                disabled={busy !== null}
                onChange={(e) => patch(c.id, { subjectId: e.target.value })}
                className="shrink-0 rounded-lg bg-neutral-900/[0.05] px-2 py-1 text-xs"
              >
                <option value="">选择科目…</option>
                {state.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {c.lastResult && (
                <span className="w-full text-xs text-neutral-400">
                  上次：{c.lastResult}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
