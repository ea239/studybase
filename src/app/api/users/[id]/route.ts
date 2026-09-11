import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { approved } = await req.json().catch(() => ({}));
  const user = await prisma.appUser.update({ where: { id }, data: { approved: Boolean(approved) } });
  return NextResponse.json({ id: user.id, approved: user.approved });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.appUser.findUnique({ where: { id }, select: { isOwner: true } });
  // Removing the owner would lock everyone out with no way back in.
  if (user?.isOwner) return NextResponse.json({ error: "不能移除管理员" }, { status: 400 });
  await prisma.appUser.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
