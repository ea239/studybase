import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai/settings";
import { chatTextStream } from "@/lib/ai/provider";
import { chatModelChain } from "@/lib/ai/routing";
import { courseCatalogue, searchSubject } from "@/lib/subjectSearch";
import { expandQuery } from "@/lib/ai/queryExpansion";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You answer a student's question about their own course.

You are given the course name, the question, a catalogue of the course (its key facts, its chapters in order, and its assessed work and exams in date order), and numbered excerpts retrieved from the course documents.

Answer in Chinese, keeping the course's own terminology, proper nouns and quoted requirements in English as the sources write them. Answer directly in the first sentence, then support it. Do not open by restating the question.

Where the answer comes from decides how sure you may sound:
- Stated in the catalogue or the excerpts — answer it, cite the excerpt numbers you used inline as [1] or [2][3], and quote exact dates, figures, weights and wording rather than paraphrasing them. The catalogue needs no citation.
- Not stated, but the material supports working it out — do that, and say plainly what you inferred it from ("课程资料里没有直接写，但根据…"). Explaining a concept the chapters cover, connecting two things the material says, or reasoning from the syllabus all count.
- The course material genuinely does not settle it — say so, say what the material does cover nearby, and stop. Never invent a date, a weight, a policy or a requirement: those are facts about this specific course, and a plausible guess is worse than an admission.
- Not about this course at all — say it is outside the course material rather than answering from general knowledge.

Where the excerpts disagree, say so and cite both. Keep it short: a few sentences, or a handful of bullets when the answer is genuinely a list. Write any formula as LaTeX between dollars.`;

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

  const catalogue = await courseCatalogue(id);
  // Widened before searching: a Chinese question against English slides, or a
  // reference like "第一项作业" against a course whose first assignment is
  // called PD0, matches nothing on the question's own words.
  const terms = settings ? await expandQuery(settings, query, catalogue) : [];
  const hits = await searchSubject(id, query, terms);

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

  // No longer short-circuits on zero hits: the catalogue alone answers most
  // questions about the shape of the course, and turning those away with "没有
  // 找到相关内容" was the single least useful thing this could do.
  if (!settings) {
    return new Response(encoder.encode(header + "还没有配置 AI 服务，上面是检索到的原始条目。"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const user = `Question: ${query}\n\n${catalogue}\n\nExcerpts from the course documents:\n${
    hits.length
      ? hits
          .map(
            (h, i) =>
              `[${i + 1}] (${h.materialName}${h.sourcePage != null ? `, p.${h.sourcePage}` : ""})\n${h.text}`
          )
          .join("\n\n")
      : "(nothing in the documents matched this question — answer from the catalogue above, or say what is missing)"
  }`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(header));
        const deltas = chatTextStream(
          settings,
          SYSTEM_PROMPT,
          [{ role: "user", content: user }],
          undefined,
          chatModelChain(settings, `${query}\n${user.slice(0, 2000)}`)
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
