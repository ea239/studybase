import { NextRequest, NextResponse } from "next/server";
import { enqueueProcessMaterial } from "@/lib/pipeline";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Same serial queue as upload, so reprocessing also refreshes the
  // affected chapter notes instead of silently skipping them.
  void enqueueProcessMaterial(id);
  return NextResponse.json({ ok: true });
}
