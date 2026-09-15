import Link from "next/link";
import { readLearnSession } from "@/lib/learn/session";
import { verifyLearnSession } from "@/lib/learn/client";

/**
 * Says so when LEARN has stopped accepting the saved session.
 *
 * The daily sync fails silently otherwise: it logs, sets a course's result to
 * an error, and nothing on the pages you actually use changes. What you see is
 * simply an absence — no new courseware, no new deadlines — which looks
 * exactly like a week when the instructors posted nothing.
 *
 * Only shown when a session exists but is being refused, not when there has
 * never been one: a course library that was only ever uploaded by hand should
 * not be nagged about a feature it does not use.
 */
export async function LearnSessionNotice() {
  const cookies = await readLearnSession();
  if (!cookies) return null;
  const live = await verifyLearnSession().catch(() => false);
  if (live) return null;

  return (
    <div className="animate-fade-up flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-2.5 text-sm text-amber-900">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
      <span>LEARN 会话已失效，自动同步暂停中——新发布的课件和截止日期不会进来。</span>
      <Link href="/settings" className="font-medium underline underline-offset-2 hover:text-amber-950">
        去设置页看怎么重新登录
      </Link>
    </div>
  );
}
