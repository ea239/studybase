import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TASKS_HIDDEN_KEY } from "@/app/api/tasks/route";

export const dynamic = "force-dynamic";

/** Turns the progress dock off for good, or back on. */
export async function POST(req: NextRequest) {
  const { hidden } = await req.json().catch(() => ({}));
  if (typeof hidden !== "boolean") {
    return NextResponse.json({ error: "缺少 hidden" }, { status: 400 });
  }
  const value = hidden ? "1" : "0";
  await prisma.setting.upsert({
    where: { key: TASKS_HIDDEN_KEY },
    update: { value },
    create: { key: TASKS_HIDDEN_KEY, value },
  });
  return NextResponse.json({ hidden });
}
