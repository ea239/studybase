import { randomUUID } from "crypto";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { OPENCODE_GO_BASE_URL, type AiSettings } from "./types";

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

  const client = openAiClient(settings);

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

function openAiClient(settings: AiSettings, sessionId?: string) {
  const baseURL =
    settings.provider === "opencode"
      ? OPENCODE_GO_BASE_URL
      : settings.provider === "custom"
        ? settings.baseUrl
        : undefined;
  // opencode Go requires clients to identify themselves and send a stable
  // per-conversation session id, or it 400s ("missing x-opencode-session").
  // One-shot callers pass nothing and get a fresh id; a chat thread passes its
  // own id so the whole conversation routes together.
  // https://opencode.ai/docs/go/#where-can-i-use-it
  const defaultHeaders =
    settings.provider === "opencode"
      ? { "x-opencode-session": sessionId ?? randomUUID(), "User-Agent": "studybase/0.1.0" }
      : undefined;
  return new OpenAI({ apiKey: settings.apiKey, baseURL, defaultHeaders });
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

// Multi-turn chat returning plain prose (no JSON envelope) — used by the
// ask-about-this-passage panel.
export async function chatText(
  settings: AiSettings,
  system: string,
  messages: ChatMessage[],
  sessionId?: string
): Promise<string> {
  if (settings.provider === "anthropic") {
    const client = new Anthropic({ apiKey: settings.apiKey });
    const resp = await client.messages.create({
      model: settings.model,
      max_tokens: 2048,
      system,
      messages,
    });
    return resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }

  const client = openAiClient(settings, sessionId);
  const resp = await client.chat.completions.create({
    model: settings.model,
    max_tokens: 2048,
    messages: [{ role: "system", content: system }, ...messages],
  });
  return resp.choices[0]?.message?.content ?? "";
}

// Streaming variant of chatText — yields content deltas as they arrive so the
// answer can render progressively instead of appearing all at once.
export async function* chatTextStream(
  settings: AiSettings,
  system: string,
  messages: ChatMessage[],
  sessionId?: string
): AsyncGenerator<string> {
  if (settings.provider === "anthropic") {
    const client = new Anthropic({ apiKey: settings.apiKey });
    const stream = await client.messages.create({
      model: settings.model,
      max_tokens: 2048,
      system,
      messages,
      stream: true,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    return;
  }

  const client = openAiClient(settings, sessionId);
  const stream = await client.chat.completions.create({
    model: settings.model,
    max_tokens: 2048,
    messages: [{ role: "system", content: system }, ...messages],
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}
