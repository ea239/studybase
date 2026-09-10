import { NextRequest, NextResponse } from "next/server";
import { processMaterial } from "@/lib/pipeline";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  void processMaterial(id);
  return NextResponse.json({ ok: true });
}
