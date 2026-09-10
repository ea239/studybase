import { NextRequest, NextResponse } from "next/server";
import { getAiSettings, saveAiSettings, redact } from "@/lib/ai/settings";
import type { AiProvider } from "@/lib/ai/types";

export async function GET() {
  const settings = await getAiSettings();
  if (!settings) return NextResponse.json(null);
  return NextResponse.json(redact(settings));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const provider = body.provider as AiProvider;
  if (!["openai", "anthropic", "custom"].includes(provider)) {
    return NextResponse.json({ error: "invalid provider" }, { status: 400 });
  }
  const model = String(body.model ?? "").trim();
  if (!model) return NextResponse.json({ error: "model is required" }, { status: 400 });

  // If the client sent back the masked placeholder, keep the existing key
  // instead of overwriting it with dots.
  let apiKey = String(body.apiKey ?? "");
  if (apiKey === "••••••••") {
    const existing = await getAiSettings();
    apiKey = existing?.apiKey ?? "";
  }
  if (!apiKey) return NextResponse.json({ error: "apiKey is required" }, { status: 400 });

  if (provider === "custom" && !body.baseUrl) {
    return NextResponse.json({ error: "baseUrl is required for custom provider" }, { status: 400 });
  }

  await saveAiSettings({
    provider,
    apiKey,
    model,
    baseUrl: provider === "custom" ? String(body.baseUrl) : undefined,
  });
  return NextResponse.json({ ok: true });
}
