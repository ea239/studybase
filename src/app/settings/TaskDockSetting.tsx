"use client";

import { useState } from "react";

export function TaskDockSetting({ initialHidden }: { initialHidden: boolean }) {
  const [hidden, setHidden] = useState(initialHidden);
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    setBusy(true);
    setHidden(next);
    await fetch("/api/settings/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: next }),
    }).catch(() => setHidden(!next));
    setBusy(false);
  }

  return (
    <div className="surface flex flex-col gap-3 rounded-xl p-4">
      <div>
        <h2 className="font-semibold">生成进度浮窗</h2>
        <p className="mt-1 text-sm text-neutral-500">
          有资料在解析、笔记或作业说明在生成时，右下角显示进度；没有任务时自动消失。
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!hidden}
          disabled={busy}
          onChange={(e) => toggle(!e.target.checked)}
          className="size-3.5 accent-neutral-900"
        />
        显示进度浮窗
      </label>
    </div>
  );
}
