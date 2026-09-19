// Runs once when the server starts. Used to schedule the daily LEARN sync —
// an in-process timer rather than a cron container, since the sync has to
// share the parse pipeline's in-memory serial queue to avoid two runs
// fighting over the same chapter rows.
export async function register() {
  // The Edge runtime copy of this file must not start timers or touch Prisma.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next dev` restarts constantly; a background sync there would be noise.
  if (process.env.NODE_ENV !== "production") return;

  // Anything the last shutdown interrupted, before anything else is queued
  // behind it.
  const { resumeInterruptedWork } = await import("@/lib/pipeline");
  await resumeInterruptedWork().catch((err) => {
    console.error("[pipeline] 恢复中断的任务失败", err);
  });

  const { startLearnSchedule } = await import("@/lib/learn/schedule");
  startLearnSchedule();
}
