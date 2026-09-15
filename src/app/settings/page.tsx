import { prisma } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";
import { Members } from "./Members";
import { LearnSync } from "./LearnSync";
import { TaskDockSetting } from "./TaskDockSetting";
import { TASKS_HIDDEN_KEY } from "@/app/api/tasks/route";
import { verifyLearnSession } from "@/lib/learn/client";
import { readLearnSession } from "@/lib/learn/session";

export const dynamic = "force-dynamic";

// Owner-only; the middleware turns non-owners away before this renders.
export default async function SettingsPage() {
  const [members, learnLive, learnCookies, learnCourses, subjects, dockSetting] = await Promise.all([
    prisma.appUser.findMany({
      orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
      select: { id: true, email: true, name: true, picture: true, approved: true, isOwner: true },
    }),
    verifyLearnSession().catch(() => false),
    readLearnSession(),
    prisma.learnCourse.findMany({ orderBy: [{ enabled: "desc" }, { name: "asc" }] }),
    prisma.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.setting.findUnique({ where: { key: TASKS_HIDDEN_KEY } }),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-semibold">设置</h1>
      <Members initial={members} />
      <LearnSync
        initial={{
          connected: learnLive,
          // Cookies on disk that LEARN has since rejected: the difference
          // between "never logged in" and "log in again".
          stale: Boolean(learnCookies) && !learnLive,
          expiresAt: learnCookies?.expiresAt?.toISOString() ?? null,
          courses: learnCourses.map((c) => ({
            ...c,
            lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
          })),
          subjects,
        }}
      />
      <TaskDockSetting initialHidden={dockSetting?.value === "1"} />
      <SettingsForm />
    </div>
  );
}
