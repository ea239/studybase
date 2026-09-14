"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DetailModal } from "@/components/DetailModal";
import { WorkDetail, type WorkDetailItem } from "@/app/subjects/[id]/WorkDetail";

export type CalendarEvent = {
  id: string;
  title: string;
  kind: "LAB" | "ASSIGNMENT" | "EXAM" | "OTHER";
  precision: "EXACT" | "RANGE" | "UNKNOWN";
  startsAt: string | null;
  endsAt: string | null;
  approxLabel: string | null;
  subjectId: string;
  subjectName: string;
  materialId: string;
  completedAt: string | null;
};

// Term boundaries and reading week have nothing to brief, so they go to the
// document they came from. Dated work opens in place — see `open` below.
function eventHref(e: CalendarEvent) {
  return e.kind === "OTHER" ? `/materials/${e.materialId}` : null;
}

const KIND_LABEL: Record<CalendarEvent["kind"], string> = {
  LAB: "实验",
  ASSIGNMENT: "作业",
  EXAM: "考试",
  OTHER: "其他",
};

const KIND_TONE: Record<CalendarEvent["kind"], string> = {
  LAB: "bg-blue-500/10 text-blue-700",
  ASSIGNMENT: "bg-violet-500/10 text-violet-700",
  EXAM: "bg-red-500/10 text-red-700",
  OTHER: "bg-neutral-900/[0.06] text-neutral-600",
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

// Local calendar arithmetic throughout: a deadline at 23:59 on the 25th must
// land on the 25th, which UTC-based keys get wrong for anyone behind UTC.
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Weeks run Monday-first, so the weekend sits together at the end.
function startOfWeek(d: Date) {
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

function startOfGrid(year: number, month: number) {
  return startOfWeek(new Date(year, month, 1));
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const hh = d.getHours();
  const mm = d.getMinutes();
  if (hh === 0 && mm === 0) return null;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

function formatDay(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** Opens work in place; sends anything without a brief to its document. */
function EventLabel({
  event,
  className,
  onOpen,
  prefix,
}: {
  event: CalendarEvent;
  className: string;
  onOpen: (e: CalendarEvent) => void;
  /** Shown before the title — the due time, where there is room for it. */
  prefix?: string;
}) {
  const href = eventHref(event);
  const label = (
    <>
      {prefix && <span className="mr-1 tabular-nums opacity-70">{prefix}</span>}
      {event.title}
    </>
  );
  const title = `${event.subjectName} · ${event.title}`;

  if (href) {
    return (
      <Link href={href} title={title} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <button onClick={() => onOpen(event)} title={title} className={className}>
      {label}
    </button>
  );
}

export function CalendarView({ events }: { events: CalendarEvent[] }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [subject, setSubject] = useState<string>("");
  // Opened over the calendar rather than navigated to: checking what a piece
  // of work asks for is a glance, and landing in a different view afterwards
  // loses the month you were reading.
  const [view, setView] = useState<"month" | "week">("month");
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  const [detail, setDetail] = useState<WorkDetailItem | null>(null);

  const openItem = (e: CalendarEvent) => {
    setDetail(null);
    setOpen(e);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/events/${open.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setDetail(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of events) seen.set(e.subjectId, e.subjectName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [events]);

  const shown = useMemo(
    () => (subject ? events.filter((e) => e.subjectId === subject) : events),
    [events, subject]
  );

  // Only a fixed day goes in a cell. A window or an undated item would be
  // claiming a precision the course never gave.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of shown) {
      if (e.precision !== "EXACT" || !e.startsAt) continue;
      const key = dayKey(new Date(e.startsAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [shown]);

  const unfixed = useMemo(
    () =>
      shown
        .filter((e) => e.precision !== "EXACT")
        .sort((a, b) => (a.startsAt ?? "9").localeCompare(b.startsAt ?? "9")),
    [shown]
  );

  // `today` is captured once on mount rather than read during render, so the
  // list cannot shift under a re-render that happens to cross midnight.
  const upcoming = useMemo(() => {
    const now = today.getTime();
    return shown
      .filter(
        (e) =>
          !e.completedAt && e.precision === "EXACT" && e.startsAt && new Date(e.startsAt).getTime() >= now
      )
      .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!))
      .slice(0, 5);
  }, [shown, today]);

  const gridStart =
    view === "week" ? startOfWeek(cursor) : startOfGrid(cursor.getFullYear(), cursor.getMonth());
  const cells = Array.from({ length: 42 }, (_, i) => {
    return new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
  });
  // Six rows only when the month actually needs them; a week is always one.
  const weeks =
    view === "week" ? 1 : cells.some((d, i) => i >= 35 && d.getMonth() === cursor.getMonth()) ? 6 : 5;

  // Stepping moves by whatever is on screen — a month at a time in month view,
  // a week at a time in week view.
  const move = (delta: number) =>
    setCursor((c) =>
      view === "week"
        ? new Date(c.getFullYear(), c.getMonth(), c.getDate() + delta * 7)
        : new Date(c.getFullYear(), c.getMonth() + delta, 1)
    );

  const weekEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 6);
  const periodLabel =
    view === "week"
      ? `${gridStart.getMonth() + 1} 月 ${gridStart.getDate()} 日 – ${weekEnd.getMonth() + 1} 月 ${weekEnd.getDate()} 日`
      : `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`;

  if (events.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        还没有日程。上传课程大纲或实验说明后，AI 会从中提取截止日期。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => move(-1)}
            aria-label={view === "week" ? "上一周" : "上个月"}
            className="rounded-lg bg-neutral-900/[0.05] px-2.5 py-1.5 text-xs transition-colors hover:bg-neutral-900/[0.1]"
          >
            ←
          </button>
          <span className="min-w-[11rem] text-center text-sm font-medium">{periodLabel}</span>
          <button
            onClick={() => move(1)}
            aria-label={view === "week" ? "下一周" : "下个月"}
            className="rounded-lg bg-neutral-900/[0.05] px-2.5 py-1.5 text-xs transition-colors hover:bg-neutral-900/[0.1]"
          >
            →
          </button>
          <button
            onClick={() =>
              setCursor(
                view === "week"
                  ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
                  : new Date(today.getFullYear(), today.getMonth(), 1)
              )
            }
            className="rounded-lg px-2 py-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-900"
          >
            今天
          </button>

          <div className="ml-1 flex items-center rounded-lg bg-neutral-900/[0.05] p-0.5">
            {(
              [
                ["month", "月"],
                ["week", "周"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => {
                  // Carries the date across rather than resetting: switching to
                  // week view from March should show a week of March, not this
                  // week.
                  setCursor((c) =>
                    value === "week"
                      ? startOfWeek(
                          c.getMonth() === today.getMonth() && c.getFullYear() === today.getFullYear()
                            ? today
                            : c
                        )
                      : new Date(c.getFullYear(), c.getMonth(), 1)
                  );
                  setView(value);
                }}
                aria-pressed={view === value}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  view === value
                    ? "bg-white font-medium text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSubject("")}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              subject === "" ? "bg-neutral-900 text-white" : "bg-neutral-900/[0.05] text-neutral-600 hover:bg-neutral-900/[0.09]"
            }`}
          >
            全部科目
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubject(s.id)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                subject === s.id ? "bg-neutral-900 text-white" : "bg-neutral-900/[0.05] text-neutral-600 hover:bg-neutral-900/[0.09]"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="surface animate-fade-up overflow-hidden rounded-2xl">
        <div className="grid grid-cols-7 border-b border-neutral-900/[0.07]">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs text-neutral-400">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.slice(0, weeks * 7).map((date, i) => {
            const inMonth = view === "week" || date.getMonth() === cursor.getMonth();
            const isToday = dayKey(date) === dayKey(today);
            const dayEvents = byDay.get(dayKey(date)) ?? [];
            return (
              <div
                key={i}
                className={`border-r border-b border-neutral-900/[0.05] p-1.5 last:border-r-0 ${
                  view === "week" ? "min-h-[16rem]" : "min-h-[5.5rem]"
                } ${inMonth ? "" : "bg-neutral-900/[0.015]"}`}
              >
                <div
                  className={`mb-1 flex size-5 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? "bg-neutral-900 font-medium text-white"
                      : inMonth
                        ? "text-neutral-500"
                        : "text-neutral-300"
                  }`}
                >
                  {date.getDate()}
                </div>
                <div className="flex flex-col gap-1">
                  {dayEvents.map((e) => (
                    <EventLabel
                      key={e.id}
                      event={e}
                      onOpen={openItem}
                      prefix={view === "week" ? (formatTime(e.startsAt!) ?? undefined) : undefined}
                      className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-75 ${
                        KIND_TONE[e.kind]
                      } ${e.completedAt ? "line-through opacity-50" : ""}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="surface flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold">即将到来</h2>
          {upcoming.length === 0 ? (
            <p className="text-xs text-neutral-400">没有已确定日期的待办。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-baseline gap-2 text-sm">
                  <span className="shrink-0 text-xs text-neutral-400">
                    {formatDay(e.startsAt!)}
                    {formatTime(e.startsAt!) && ` ${formatTime(e.startsAt!)}`}
                  </span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] ${KIND_TONE[e.kind]}`}>
                    {KIND_LABEL[e.kind]}
                  </span>
                  <EventLabel
                    event={e}
                    onOpen={openItem}
                    className="min-w-0 flex-1 truncate text-left text-neutral-800 transition-colors hover:text-blue-600"
                  />
                  <span className="shrink-0 text-xs text-neutral-400">{e.subjectName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface flex flex-col gap-2 rounded-2xl p-4">
          <div>
            <h2 className="text-sm font-semibold">待定 / 大致时间</h2>
            {/* Deliberately not on the calendar: the course gave a window or
                no date, and pinning it to a day would invent a certainty. */}
            <p className="mt-0.5 text-xs text-neutral-400">课程只给了范围或尚未公布，未标到具体日期。</p>
          </div>
          {unfixed.length === 0 ? (
            <p className="text-xs text-neutral-400">没有待定项。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {unfixed.map((e) => (
                <li key={e.id} className="flex items-baseline gap-2 text-sm">
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] ${KIND_TONE[e.kind]}`}>
                    {KIND_LABEL[e.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-neutral-800">{e.title}</span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {e.precision === "RANGE" && e.startsAt && e.endsAt
                      ? `${formatDay(e.startsAt)} – ${formatDay(e.endsAt)}`
                      : (e.approxLabel ?? "待公布")}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-400">{e.subjectName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {open && (
        <DetailModal
          title={detail?.title ?? open.title}
          onClose={() => setOpen(null)}
          actions={
            <Link
              href={`/subjects/${open.subjectId}?tab=work`}
              className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900"
            >
              查看全部作业
            </Link>
          }
        >
          {detail ? (
            <WorkDetail subjectId={open.subjectId} item={detail} embedded />
          ) : (
            <p className="py-8 text-center text-sm text-neutral-400">加载中…</p>
          )}
        </DetailModal>
      )}
    </div>
  );
}
