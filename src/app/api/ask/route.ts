import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai/settings";
import { chatTextStream, type ChatMessage } from "@/lib/ai/provider";

const MAX_QUOTE = 4000;
// The chapter being read goes in whole; the rest of the course is pulled in by
// keyword so a question that reaches across chapters still has something to
// work with, without shipping the entire subject on every turn.
const MAX_OTHER_POINTS = 12;
const MAX_PAGE_TEXT = 3000;

type CoursePoint = { chapter: string; title: string; content: string };

function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9一-鿿]+/)
        .filter((t) => t.length >= 2)
    ),
  ];
}

async function gatherCourseContext(
  subjectId: string | undefined,
  chapterId: string | undefined,
  question: string,
  quote: string | undefined
) {
  if (!subjectId && !chapterId) return { chapterPoints: [] as CoursePoint[], relatedPoints: [] as CoursePoint[] };

  const chapterPoints: CoursePoint[] = chapterId
    ? (
        await prisma.knowledgePoint.findMany({
          where: { chapterId },
          orderBy: { sourcePage: "asc" },
          select: { title: true, content: true, chapter: { select: { name: true } } },
        })
      ).map((p) => ({ chapter: p.chapter?.name ?? "", title: p.title, content: p.content }))
    : [];

  // Everything else in the subject, ranked by how many question terms it hits.
  let relatedPoints: CoursePoint[] = [];
  if (subjectId) {
    const rest = await prisma.knowledgePoint.findMany({
      where: { chapter: { subjectId }, NOT: chapterId ? { chapterId } : undefined },
      select: { title: true, content: true, chapter: { select: { name: true } } },
    });
    const terms = tokenize(`${question} ${quote ?? ""}`);
    relatedPoints = rest
      .map((p) => {
        const hay = `${p.title} ${p.content}`.toLowerCase();
        return { p, score: terms.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_OTHER_POINTS)
      .map(({ p }) => ({ chapter: p.chapter?.name ?? "", title: p.title, content: p.content }));
  }

  return { chapterPoints, relatedPoints };
}

function renderPoints(points: CoursePoint[]) {
  return points.map((p) => `- ${p.title}: ${p.content}`).join("\n");
}

function systemPrompt(opts: {
  quote?: string;
  context?: string;
  pageText?: string;
  chapterPoints: CoursePoint[];
  relatedPoints: CoursePoint[];
  lang: string;
}) {
  const language =
    opts.lang === "en"
      ? "Answer in English."
      : "用中文回答，但保留专业术语的英文原文（例如 physical schema、DBMS、TCP）。";

  return [
    "You are a tutor for this student's own course. The course material they have uploaded is given below — treat it as the authoritative source and answer from it.",
    opts.context ? `They are reading: ${opts.context}` : "",
    opts.quote ? `They highlighted this passage:\n"""\n${opts.quote}\n"""` : "",
    opts.chapterPoints.length
      ? `Course material from this chapter:\n${renderPoints(opts.chapterPoints)}`
      : "",
    opts.relatedPoints.length
      ? `Related material from elsewhere in the same course:\n${renderPoints(opts.relatedPoints)}`
      : "",
    opts.pageText ? `Verbatim text of the source slide:\n"""\n${opts.pageText}\n"""` : "",
    [
      "Answer the question directly, as a tutor would — explain the idea, give the concrete example or mechanism, work through it.",
      "Never comment on what the highlighted passage does or does not contain, never say the material is insufficient, and never tell the student what the notes are missing. You have the chapter's material above; use it.",
      "If something genuinely is not covered anywhere in the material above, just answer from standard knowledge of the subject without remarking on the gap.",
      "Keep it tight: no preamble, no restating the question.",
      "The panel renders GitHub-flavoured markdown, fenced code blocks and LaTeX (KaTeX), so use $...$ for inline math and $$...$$ for display math where a formula helps.",
    ].join(" "),
    language,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const settings = await getAiSettings();
  if (!settings) {
    return NextResponse.json({ error: "请先在设置页配置 AI" }, { status: 400 });
  }

  const quote = typeof body.quote === "string" ? body.quote.slice(0, MAX_QUOTE) : undefined;
  const context = typeof body.context === "string" ? body.context.slice(0, 200) : undefined;
  const chapterId = typeof body.chapterId === "string" ? body.chapterId : undefined;
  const subjectId = typeof body.subjectId === "string" ? body.subjectId : undefined;
  const lang = body.lang === "en" ? "en" : "zh";
  const question = messages[messages.length - 1]?.content ?? "";

  // Persist the thread so it can be reopened later (and from another device).
  // A missing/stale id just starts a new thread rather than failing the ask.
  let conversationId: string | undefined =
    typeof body.conversationId === "string" ? body.conversationId : undefined;
  if (conversationId) {
    const exists = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
    if (!exists) conversationId = undefined;
  }
  if (!conversationId) {
    const created = await prisma.conversation.create({
      data: {
        title: question.slice(0, 60) || "新对话",
        subjectId,
        chapterId,
      },
      select: { id: true },
    });
    conversationId = created.id;
  }
  await prisma.conversationMessage.create({
    data: { conversationId, role: "user", content: question, quote: quote ?? null },
  });

  try {
    const { chapterPoints, relatedPoints } = await gatherCourseContext(subjectId, chapterId, question, quote);

    // The slide's raw text, when the quote came from a bullet citing a page.
    let pageText: string | undefined;
    if (typeof body.materialId === "string" && Number.isInteger(body.sourcePage)) {
      const page = await prisma.materialPage.findFirst({
        where: { materialId: body.materialId, pageNumber: body.sourcePage },
        select: { rawText: true },
      });
      pageText = page?.rawText.slice(0, MAX_PAGE_TEXT);
    }

    const deltas = chatTextStream(
      settings,
      systemPrompt({ quote, context, pageText, chapterPoints, relatedPoints, lang }),
      messages,
      typeof body.sessionId === "string" ? body.sessionId : undefined
    );

    // Plain text stream: the client appends each chunk as it lands, so the
    // answer renders progressively instead of after the whole generation.
    const encoder = new TextEncoder();
    const threadId = conversationId;
    const stream = new ReadableStream({
      async start(controller) {
        let answer = "";
        // Every controller call is guarded: once the client disconnects they
        // throw, and an unguarded throw here would skip persisting an answer
        // that was already generated (and paid for).
        const push = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // Client went away; keep draining so the answer still gets saved.
          }
        };

        try {
          for await (const delta of deltas) {
            answer += delta;
            push(delta);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "生成中断";
          push(`\n\n[错误] ${message}`);
        } finally {
          try {
            controller.close();
          } catch {
            // Already closed by the client disconnecting.
          }
          // A partial answer is still worth keeping, an empty one is not.
          if (answer.trim()) {
            await prisma.conversationMessage
              .create({ data: { conversationId: threadId, role: "assistant", content: answer } })
              .catch(() => {});
            await prisma.conversation
              .update({ where: { id: threadId }, data: { updatedAt: new Date() } })
              .catch(() => {});
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        // Lets the client attach follow-up turns to this same thread.
        "X-Conversation-Id": threadId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "请求失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
