import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Owner-only: the middleware gates /api/users before this runs.
export async function GET() {
  const users = await prisma.appUser.findMany({
    orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
    select: { id: true, email: true, name: true, picture: true, approved: true, isOwner: true, createdAt: true },
  });
  return NextResponse.json(users);
}
