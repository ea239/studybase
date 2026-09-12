import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueProcessMaterial } from "@/lib/pipeline";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Mark it queued before returning. The queue is serial, so a row can wait a
  // long while for its turn, and until it does it would otherwise keep showing
  // the error from its last run — indistinguishable, to anyone reading the
  // page, from a reprocess that never happened.
  await prisma.material.update({
    where: { id },
    data: { status: "PENDING", errorMessage: null },
  });

  // Same serial queue as upload, so reprocessing also refreshes the
  // affected chapter notes instead of silently skipping them.
  void enqueueProcessMaterial(id);
  return NextResponse.json({ ok: true });
}
