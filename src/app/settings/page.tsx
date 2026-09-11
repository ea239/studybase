import { prisma } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";
import { Members } from "./Members";

export const dynamic = "force-dynamic";

// Owner-only; the middleware turns non-owners away before this renders.
export default async function SettingsPage() {
  const members = await prisma.appUser.findMany({
    orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
    select: { id: true, email: true, name: true, picture: true, approved: true, isOwner: true },
  });

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-semibold">设置</h1>
      <Members initial={members} />
      <SettingsForm />
    </div>
  );
}
