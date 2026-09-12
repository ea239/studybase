import { randomUUID } from "crypto";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { OPENCODE_GO_BASE_URL, type AiSettings } from "./types";

// Batch work runs on a serial queue, so a request that hangs stalls every
// document behind it. Both SDKs default to a 10-minute timeout with 2 retries
// — up to half an hour on one stuck call — which is far too long to wait
// before giving up and moving on.
//
// No retries: a long extraction request that timed out will almost always
// time out again, and a second attempt doubles the worst case for every part
// of a chunked document. A part that fails is dropped on its own instead,
// which costs that part rather than twice the time.
const BATCH_TIMEOUT_MS = 5 * 60 * 1000;
const BATCH_RETRIES = 0;

// Extraction is transcription, not deduction: the answer is already in the
// text and a chain of thought adds nothing to finding it. It is not free
// either — a reasoning model spent ~20k characters thinking before every
// batch call regardless of input size, which is what made long documents time
// out. Measured on one 44-page question bank: 49k characters of source failed
// outright with thinking on, and finished in 91 seconds with it off.
//
// Only opencode gets the flag; OpenAI and Anthropic reject unknown body
// fields outright. The interactive chat path keeps its reasoning, where a
// considered answer is the point and nothing is queued behind it.
function batchBodyExtras(settings: AiSettings) {
  return settings.provider === "opencode" ? { enable_thinking: false } : {};
}

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
    const client = new Anthropic({
      apiKey: settings.apiKey,
      timeout: BATCH_TIMEOUT_MS,
      maxRetries: BATCH_RETRIES,
    });
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

  const client = openAiClient(settings, undefined, {
    timeout: BATCH_TIMEOUT_MS,
    maxRetries: BATCH_RETRIES,
  });

  const messages = [
    { role: "system" as const, content: `${system}\n\n${jsonInstruction}` },
    { role: "user" as const, content: user },
  ];
  const extras = batchBodyExtras(settings);

  try {
    const resp = await client.chat.completions.create({
      model: settings.model,
      messages,
      response_format: { type: "json_object" },
      ...extras,
    });
    return parseJsonLoose(resp.choices[0]?.message?.content ?? "{}");
  } catch {
    // Some OpenAI-compatible endpoints (self-hosted / custom models) reject
    // response_format. Retry once without it, relying on the prompt alone.
    const resp = await client.chat.completions.create({
      model: settings.model,
      messages,
      ...extras,
    });
    return parseJsonLoose(resp.choices[0]?.message?.content ?? "{}");
  }
}

function openAiClient(
  settings: AiSettings,
  sessionId?: string,
  limits?: { timeout: number; maxRetries: number }
) {
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
  return new OpenAI({ apiKey: settings.apiKey, baseURL, defaultHeaders, ...limits });
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
