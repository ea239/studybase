import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AiSettings } from "./types";

// Sends a single-turn chat request and returns the parsed JSON response.
// Supports OpenAI, Anthropic, and any OpenAI-compatible custom endpoint —
// this is the one place provider differences are handled, so extraction
// logic elsewhere never needs to know which provider is active.
export async function chatJSON(
  settings: AiSettings,
  system: string,
  user: string
): Promise<unknown> {
  const jsonInstruction =
    "Respond with ONLY a single valid JSON object. No markdown code fences, no commentary before or after.";

  if (settings.provider === "anthropic") {
    const client = new Anthropic({ apiKey: settings.apiKey });
    const resp = await client.messages.create({
      model: settings.model,
      max_tokens: 8192,
      system: `${system}\n\n${jsonInstruction}`,
      messages: [{ role: "user", content: user }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return parseJsonLoose(text);
  }

  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.provider === "custom" ? settings.baseUrl : undefined,
  });

  try {
    const resp = await client.chat.completions.create({
      model: settings.model,
      messages: [
        { role: "system", content: `${system}\n\n${jsonInstruction}` },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    return parseJsonLoose(resp.choices[0]?.message?.content ?? "{}");
  } catch {
    // Some OpenAI-compatible endpoints (self-hosted / custom models) reject
    // response_format. Retry once without it, relying on the prompt alone.
    const resp = await client.chat.completions.create({
      model: settings.model,
      messages: [
        { role: "system", content: `${system}\n\n${jsonInstruction}` },
        { role: "user", content: user },
      ],
    });
    return parseJsonLoose(resp.choices[0]?.message?.content ?? "{}");
  }
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}
