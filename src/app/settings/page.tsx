import { prisma } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";
import { Members } from "./Members";
import { LearnSync } from "./LearnSync";
import { readLearnSession } from "@/lib/learn/session";

export const dynamic = "force-dynamic";

// Owner-only; the middleware turns non-owners away before this renders.
export default async function SettingsPage() {
  const [members, learnSession, learnCourses, subjects] = await Promise.all([
    prisma.appUser.findMany({
      orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
      select: { id: true, email: true, name: true, picture: true, approved: true, isOwner: true },
    }),
    readLearnSession(),
    prisma.learnCourse.findMany({ orderBy: [{ enabled: "desc" }, { name: "asc" }] }),
    prisma.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-semibold">设置</h1>
      <Members initial={members} />
      <LearnSync
        initial={{
          connected: Boolean(learnSession),
          expiresAt: learnSession?.expiresAt?.toISOString() ?? null,
          courses: learnCourses.map((c) => ({
            ...c,
            lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
          })),
          subjects,
        }}
      />
      <SettingsForm />
    </div>
  );
}
