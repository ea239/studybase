"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailModal } from "@/components/DetailModal";
import { WorkDetail, type WorkDetailItem } from "./WorkDetail";

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

// Each kind gets its own hue so a list of fifteen reads as a shape rather than
// fifteen identical rows.
const KIND_TONE: Record<WorkItem["kind"], { chip: string; bubble: string }> = {
  LAB: { chip: "bg-sky-500/15 text-sky-800", bubble: "hover:border-sky-400/50" },
  ASSIGNMENT: { chip: "bg-violet-500/15 text-violet-800", bubble: "hover:border-violet-400/50" },
  EXAM: { chip: "bg-rose-500/15 text-rose-800", bubble: "hover:border-rose-400/50" },
  OTHER: { chip: "bg-stone-500/15 text-stone-700", bubble: "hover:border-stone-400/50" },
};

function dueLabel(item: WorkItem) {
  if (item.precision === "RANGE" && item.startsAt && item.endsAt) {
    const a = new Date(item.startsAt);
    const b = new Date(item.endsAt);
    return `${a.getMonth() + 1}月${a.getDate()}日 – ${b.getMonth() + 1}月${b.getDate()}日`;
  }
  if (!item.startsAt) return item.approxLabel ?? "待公布";
  const d = new Date(item.startsAt);
  const time =
    d.getHours() || d.getMinutes() ? ` ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : "";
  return `${d.getMonth() + 1}月${d.getDate()}日${time}`;
}

function daysFrom(iso: string, now: number) {
  return Math.round((new Date(iso).getTime() - now) / 86_400_000);
}

export function WorkList({
  subjectId,
  items,
  otherCount = 0,
  initialItemId,
}: {
  subjectId: string;
  items: WorkItem[];
  /** Dated entries with nothing to hand in — term boundaries, reading week. */
  otherCount?: number;
  initialItemId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialItemId ?? null);
  const [detail, setDetail] = useState<WorkDetailItem | null>(null);
  // Captured once, so the overdue line cannot move under an unrelated render.
  const [now] = useState(() => Date.now());

  // Fetches only; the stale item is cleared where the new one is chosen, so
  // this effect never sets state on its own render pass.
  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    fetch(`/api/events/${openId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setDetail(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [openId]);

  const { open, done } = useMemo(() => {
    const open: WorkItem[] = [];
    const done: WorkItem[] = [];
    for (const item of items) (item.completedAt ? done : open).push(item);
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

  const Bubble = ({ item, index }: { item: WorkItem; index: number }) => {
    const finished = Boolean(item.completedAt);
    const overdue =
      !finished && item.precision === "EXACT" && item.startsAt != null && new Date(item.startsAt).getTime() < now;
    const days = !finished && item.startsAt ? daysFrom(item.startsAt, now) : null;
    const soon = !overdue && days != null && days >= 0 && days <= 3;
    const tone = KIND_TONE[item.kind];

    return (
      <li
        className="animate-fade-up"
        style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      >
        <div
          className={`group flex items-center gap-3 rounded-full border py-2.5 pr-4 pl-3.5 transition-all duration-200 ${
            overdue
              ? "border-red-500/45 bg-red-500/[0.07] hover:border-red-500/70 hover:bg-red-500/[0.11]"
              : finished
                ? "border-transparent bg-neutral-900/[0.03] opacity-60"
                : `surface ${tone.bubble} hover:-translate-y-0.5`
          }`}
        >
          <input
            type="checkbox"
            checked={finished}
            disabled={busy === item.id}
            onChange={(e) => toggle(item.id, e.target.checked)}
            aria-label={`标记 ${item.title} 已完成`}
            className={`size-4 shrink-0 rounded-full ${overdue ? "accent-red-600" : "accent-neutral-900"}`}
          />
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              overdue ? "bg-red-500/15 text-red-700" : tone.chip
            }`}
          >
            {KIND_LABEL[item.kind]}
          </span>
          <button
            onClick={() => {
              setDetail(null);
              setOpenId(item.id);
            }}
            className={`min-w-0 flex-1 truncate text-left text-sm transition-colors ${
              overdue
                ? "font-medium text-red-800"
                : finished
                  ? "text-neutral-500 line-through"
                  : "text-neutral-800 group-hover:text-neutral-950"
            }`}
          >
            {item.title}
          </button>
          {item.hasBrief && !overdue && (
            <span className="shrink-0 text-[11px] text-neutral-400" title="已生成作业说明">
              已整理
            </span>
          )}
          {overdue ? (
            <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white">
              OVERDUE
            </span>
          ) : soon ? (
            <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              {days === 0 ? "今天" : `${days} 天后`}
            </span>
          ) : null}
          <span
            className={`shrink-0 text-xs tabular-nums ${
              overdue ? "font-medium text-red-700" : finished ? "text-neutral-400" : "text-neutral-500"
            }`}
          >
            {dueLabel(item)}
          </span>
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-2">
        {open.map((item, i) => (
          <Bubble key={item.id} item={item} index={i} />
        ))}
        {open.length === 0 && <p className="text-sm text-neutral-500">全部完成了。</p>}
      </ul>

      {done.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
            已完成 · {done.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {done.map((item, i) => (
              <Bubble key={item.id} item={item} index={i} />
            ))}
          </ul>
        </div>
      )}

      {otherCount > 0 && (
        // Said out loud rather than silently filtered: if something is
        // misclassified, a count that does not match the calendar is the only
        // clue there is.
        <p className="text-xs text-neutral-400">
          另有 {otherCount} 项课程日程（开学、Reading Week 等无需提交的日期）未列在这里，可在日历查看。
        </p>
      )}

      {openId && (
        <DetailModal title={detail?.title ?? "作业"} onClose={() => setOpenId(null)}>
          {detail ? (
            <WorkDetail subjectId={subjectId} item={detail} embedded />
          ) : (
            <p className="py-8 text-center text-sm text-neutral-400">加载中…</p>
          )}
        </DetailModal>
      )}
    </div>
  );
}
