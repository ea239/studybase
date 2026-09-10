import { NextResponse } from "next/server";
import { getOrCreateMcpToken, regenerateMcpToken } from "@/lib/mcp/auth";

export async function GET() {
  const token = await getOrCreateMcpToken();
  return NextResponse.json({ token });
}

// Regenerates the token — any client (ChatGPT connector, etc.) using the old
// one stops working immediately.
export async function POST() {
  const token = await regenerateMcpToken();
  return NextResponse.json({ token });
}
