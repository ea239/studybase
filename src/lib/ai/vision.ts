import OpenAI from "openai";
import { randomUUID } from "crypto";
import { OPENCODE_GO_BASE_URL, type AiSettings } from "./types";

// Reading an image is one long generation, and the batch timeout is tuned for
// text. A photographed page of dense notes is slower than a chunk of a PDF.
const VISION_TIMEOUT_MS = 5 * 60 * 1000;

const SYSTEM_PROMPT = `You read a picture of course material — a photographed or screenshotted slide, whiteboard, textbook page, worked solution or set of handwritten notes — and write out what it contains, so it can be studied and searched as text.

- Transcribe all the text you can read, keeping its structure: headings as headings, lists as lists, in the order it appears.
- Write every formula and mathematical symbol as LaTeX between dollars, never as plain text or Unicode symbols.
- Where the picture carries meaning the words do not — a diagram, a graph, a circuit, a table, an annotated figure — describe it well enough that someone who cannot see it understands what it shows: what the parts are, how they connect, what the axes and labels say, what it demonstrates.
- Keep the original language. Do not translate, summarise, or add anything that is not in the picture.
- If part of it is genuinely illegible, say so at that point rather than guessing at it.
- If the picture contains no course material at all, say exactly that and nothing else.`;

/**
 * Turns an image into the text the rest of the pipeline works on.
 *
 * Everything downstream — extraction, notes, search, citations — reads text,
 * so an image is transcribed once at the door rather than teaching each of
 * them to see. A vision model is used rather than OCR because so much of what
 * matters on a lecture slide is the diagram, which OCR returns as nothing.
 */
export async function transcribeImage(
  settings: AiSettings,
  image: Buffer,
  mimeType: string
): Promise<string> {
  const model = settings.visionModel?.trim();
  if (!model) {
    throw new Error("还没有配置识图模型，无法解析图片。请在设置页选择一个识图模型。");
  }

  const baseURL =
    settings.provider === "opencode"
      ? OPENCODE_GO_BASE_URL
      : settings.provider === "custom"
        ? settings.baseUrl
        : undefined;
  const defaultHeaders =
    settings.provider === "opencode"
      ? { "x-opencode-session": randomUUID(), "User-Agent": "studybase/0.1.0" }
      : undefined;

  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL,
    defaultHeaders,
    timeout: VISION_TIMEOUT_MS,
    maxRetries: 0,
  });

  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Write out everything this picture contains." },
          {
            type: "image_url",
            // Sent inline: the gateway cannot reach this app, which is behind
            // a tunnel and requires a session cookie.
            image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` },
          },
        ],
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("识图模型没有返回任何内容");
  return text;
}
