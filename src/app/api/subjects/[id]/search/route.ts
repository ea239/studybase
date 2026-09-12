import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai/settings";
import { chatTextStream } from "@/lib/ai/provider";
import { pickModel } from "@/lib/ai/routing";
import { searchSubject } from "@/lib/subjectSearch";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You answer a student's question about their own course, using only the course's own material.

You are given the course name, the question, and numbered excerpts retrieved from that course: extracted knowledge points, raw pages from the course documents, and the course's dated items.

- Answer in Chinese, keeping the course's own terminology, proper nouns and quoted requirements in English as the sources write them.
- Answer the question directly in the first sentence, then support it. Do not open by restating the question.
- Cite the excerpt numbers you used, inline, as [1] or [2][3], right after the claim they support.
- Quote exact figures, dates, weights and wording rather than paraphrasing them.
- Use only what the excerpts say. If they do not answer the question, say so plainly and say what they do cover — do not fall back on how courses usually work.
- Where excerpts disagree, say so and cite both.
- Keep it short: a few sentences, or a handful of bullets when the answer is genuinely a list.
- Write any formula as LaTeX between dollars.`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "缺少搜索内容" }, { status: 400 });
  }

  const [subject, settings] = await Promise.all([
    prisma.subject.findUnique({ where: { id }, select: { name: true } }),
    getAiSettings(),
  ]);
  if (!subject) return NextResponse.json({ error: "not found" }, { status: 404 });

  const hits = await searchSubject(id, query);

  const encoder = new TextEncoder();
  // The sources are known before a word is generated, so they go out first as
  // a header line and the page can show where the answer is coming from while
  // it is still being written.
  const header =
    JSON.stringify({
      sources: hits.map((h) => ({
        kind: h.kind,
        title: h.title,
        materialName: h.materialName,
        sourcePage: h.sourcePage,
        href: h.href,
      })),
    }) + "\n";

  if (hits.length === 0 || !settings) {
    return new Response(
      encoder.encode(
        header +
          (hits.length === 0
            ? "这门课的资料里没有找到相关内容。"
            : "还没有配置 AI 服务，上面是检索到的原始条目。")
      ),
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const user = `Course: ${subject.name}\nQuestion: ${query}\n\nExcerpts:\n${hits
    .map(
      (h, i) =>
        `[${i + 1}] (${h.materialName}${h.sourcePage != null ? `, p.${h.sourcePage}` : ""})\n${h.text}`
    )
    .join("\n\n")}`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(header));
        const deltas = chatTextStream(
          { ...settings, model: pickModel(settings, "content", `${query}\n${user.slice(0, 2000)}`) },
          SYSTEM_PROMPT,
          [{ role: "user", content: user }]
        );
        for await (const delta of deltas) controller.enqueue(encoder.encode(delta));
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n\n（生成失败：${err instanceof Error ? err.message : String(err)}）`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
