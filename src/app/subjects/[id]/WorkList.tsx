"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type WorkItem = {
  id: string;
  title: string;
  kind: "LAB" | "ASSIGNMENT" | "EXAM" | "OTHER";
  precision: "EXACT" | "RANGE" | "UNKNOWN";
  startsAt: string | null;
  endsAt: string | null;
  approxLabel: string | null;
  completedAt: string | null;
  hasBrief: boolean;
};

const KIND_LABEL: Record<WorkItem["kind"], string> = {
  LAB: "实验",
  ASSIGNMENT: "作业",
  EXAM: "考试",
  OTHER: "其他",
};

const KIND_TONE: Record<WorkItem["kind"], string> = {
  LAB: "bg-blue-500/10 text-blue-700",
  ASSIGNMENT: "bg-violet-500/10 text-violet-700",
  EXAM: "bg-red-500/10 text-red-700",
  OTHER: "bg-neutral-900/[0.06] text-neutral-600",
};

function dueLabel(item: WorkItem) {
  if (item.precision === "RANGE" && item.startsAt && item.endsAt) {
    const a = new Date(item.startsAt);
    const b = new Date(item.endsAt);
    return `${a.getMonth() + 1}/${a.getDate()} – ${b.getMonth() + 1}/${b.getDate()}`;
  }
  if (!item.startsAt) return item.approxLabel ?? "待公布";
  const d = new Date(item.startsAt);
  const time = d.getHours() || d.getMinutes() ? ` ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : "";
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日${time}`;
}

export function WorkList({ subjectId, items }: { subjectId: string; items: WorkItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // Captured once, so a re-render cannot move the overdue line under the user.
  const [now] = useState(() => Date.now());

  const { open, done } = useMemo(() => {
    const open: WorkItem[] = [];
    const done: WorkItem[] = [];
    for (const item of items) (item.completedAt ? done : open).push(item);
    // Undated work sorts last among the open items rather than first.
    open.sort((a, b) => (a.startsAt ?? "9999").localeCompare(b.startsAt ?? "9999"));
    done.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return { open, done };
  }, [items]);

  async function toggle(id: string, completed: boolean) {
    setBusy(id);
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    router.refresh();
    setBusy(null);
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        这门课还没有识别到作业或考试。上传课程大纲、实验说明或作业页面后，AI 会从中提取。
      </p>
    );
  }

  const Row = ({ item }: { item: WorkItem }) => {
    // Only a fixed, uncompleted date can be overdue — a window or an undated
    // item has nothing to be late against.
    const overdue =
      !item.completedAt &&
      item.precision === "EXACT" &&
      item.startsAt != null &&
      new Date(item.startsAt).getTime() < now;
    const finished = Boolean(item.completedAt);

    return (
      <li
        className={`surface flex items-center gap-3 rounded-xl px-4 py-2.5 ${finished ? "opacity-55" : ""}`}
      >
        <input
          type="checkbox"
          checked={finished}
          disabled={busy === item.id}
          onChange={(e) => toggle(item.id, e.target.checked)}
          aria-label={`标记 ${item.title} 已完成`}
          className="size-3.5 shrink-0 accent-neutral-900"
        />
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] ${KIND_TONE[item.kind]}`}>
          {KIND_LABEL[item.kind]}
        </span>
        <Link
          href={`/subjects/${subjectId}?tab=work&item=${item.id}`}
          className={`min-w-0 flex-1 truncate text-sm transition-colors hover:text-blue-600 ${
            finished ? "text-neutral-500 line-through" : "text-neutral-800"
          }`}
        >
          {item.title}
        </Link>
        {item.hasBrief && (
          <span className="shrink-0 text-[11px] text-neutral-400" title="已生成作业说明">
            已整理
          </span>
        )}
        <span
          className={`shrink-0 text-xs ${
            overdue ? "font-medium text-red-600" : finished ? "text-neutral-400" : "text-neutral-500"
          }`}
        >
          {dueLabel(item)}
          {overdue && " · 已逾期"}
        </span>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-1.5">
        {open.map((item) => (
          <Row key={item.id} item={item} />
        ))}
        {open.length === 0 && <p className="text-sm text-neutral-500">全部完成了。</p>}
      </ul>

      {done.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
            已完成 · {done.length}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {done.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
