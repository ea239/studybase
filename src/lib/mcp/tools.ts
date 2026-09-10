import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { prisma } from "@/lib/db";
import { resolveSubject, resolveChapter } from "./lookup";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function notFound(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

// Every tool here is read-only by design — see the project plan's rule that
// a plugin should never get raw database access, only scoped queries. There
// is no write/save/delete tool: GPT can read and cite this data, but
// changing it happens in the app, by a human.
export function registerTools(server: McpServer) {
  server.registerTool(
    "list_subjects",
    {
      title: "List courses",
      description:
        "List every course in StudyBase (each 'subject' is one specific course, e.g. 'ECE 356'), with its chapters and how many lecture/overview/lab materials it has. Call this first to discover what's available.",
      inputSchema: z.object({}),
    },
    async () => {
      const subjects = await prisma.subject.findMany({
        orderBy: { name: "asc" },
        include: { chapters: { orderBy: { order: "asc" } } },
      });
      const data = await Promise.all(
        subjects.map(async (s) => {
          const [lecture, overview, lab] = await Promise.all([
            prisma.material.count({ where: { subjectId: s.id, category: "NOTES" } }),
            prisma.material.count({ where: { subjectId: s.id, category: "OVERVIEW" } }),
            prisma.material.count({ where: { subjectId: s.id, category: "LAB" } }),
          ]);
          return {
            id: s.id,
            name: s.name,
            chapters: s.chapters.map((c) => ({ id: c.id, name: c.name })),
            materialCounts: { lecture, overview, lab },
          };
        })
      );
      return text(data);
    }
  );

  server.registerTool(
    "get_course_overview",
    {
      title: "Get course overview",
      description:
        "Table-of-contents view of one course: chapters with how many knowledge points/questions each has, a list of labs (with their key facts: requirements, grading, deadlines), and course info (grading breakdown, schedule, deadlines) extracted from syllabus/overview documents. Use search_knowledge, search_questions, or get_lab for full detail on any part of this.",
      inputSchema: z.object({
        subject: z.string().describe("Subject id or name, e.g. 'ECE 356'"),
      }),
    },
    async ({ subject }) => {
      const s = await resolveSubject(subject);
      if (!s) return notFound(`No course found matching "${subject}". Call list_subjects to see what's available.`);

      const [chapters, materials] = await Promise.all([
        prisma.chapter.findMany({
          where: { subjectId: s.id },
          orderBy: { order: "asc" },
          include: { _count: { select: { knowledgePoints: true, questions: true } } },
        }),
        prisma.material.findMany({
          where: { subjectId: s.id },
          include: { knowledgePoints: true },
        }),
      ]);

      const labMaterials = materials.filter((m) => m.category === "LAB");
      const overviewMaterials = materials.filter((m) => m.category === "OVERVIEW");

      return text({
        subject: { id: s.id, name: s.name },
        chapters: chapters.map((c) => ({
          id: c.id,
          name: c.name,
          knowledgePointCount: c._count.knowledgePoints,
          questionCount: c._count.questions,
        })),
        labs: labMaterials.map((m) => ({
          materialId: m.id,
          filename: m.filename,
          items: m.knowledgePoints.map((kp) => ({
            category: kp.tags,
            title: kp.title,
            content: kp.content,
            sourcePage: kp.sourcePage,
          })),
        })),
        courseInfo: overviewMaterials.flatMap((m) =>
          m.knowledgePoints.map((kp) => ({
            category: kp.tags,
            title: kp.title,
            content: kp.content,
            sourceMaterialId: m.id,
            sourceFilename: m.filename,
            sourcePage: kp.sourcePage,
          }))
        ),
        note: "This is extracted grading/schedule info from the syllabus, not the student's actual earned grades — StudyBase has no grade-tracking feature.",
      });
    }
  );

  server.registerTool(
    "search_knowledge",
    {
      title: "Search knowledge points",
      description:
        "Search lecture knowledge points (definitions, formulas, concepts, worked examples) by keyword, optionally scoped to a course and/or chapter. Returns each result with its source material, page, and a confidence score — low confidence means the extraction may need human review.",
      inputSchema: z.object({
        query: z.string().describe("Keyword to search for in titles and content"),
        subject: z.string().optional().describe("Subject id or name to scope the search to"),
        chapter: z.string().optional().describe("Chapter id or name to scope the search to (requires subject)"),
      }),
    },
    async ({ query, subject, chapter }) => {
      let subjectId: string | undefined;
      let chapterId: string | undefined;
      if (subject) {
        const s = await resolveSubject(subject);
        if (!s) return notFound(`No course found matching "${subject}".`);
        subjectId = s.id;
        if (chapter) {
          const c = await resolveChapter(s.id, chapter);
          if (!c) return notFound(`No chapter found matching "${chapter}" in ${s.name}.`);
          chapterId = c.id;
        }
      }

      const results = await prisma.knowledgePoint.findMany({
        where: {
          OR: [{ title: { contains: query } }, { content: { contains: query } }],
          chapterId,
          material: subjectId ? { subjectId } : undefined,
        },
        include: { material: { select: { id: true, filename: true } }, chapter: { select: { name: true } } },
        take: 25,
      });

      return text(
        results.map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          sourceMaterialId: r.material.id,
          sourceFilename: r.material.filename,
          sourcePage: r.sourcePage,
          chapter: r.chapter?.name ?? null,
          confidence: r.confidence,
          humanEdited: !r.isAiGenerated,
        }))
      );
    }
  );

  server.registerTool(
    "get_knowledge_point",
    {
      title: "Get knowledge point detail",
      description:
        "Full detail for one knowledge point by id, including the verbatim source page text it was extracted from — use this to quote the original wording rather than the AI summary when precision matters.",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      const kp = await prisma.knowledgePoint.findUnique({
        where: { id },
        include: { material: true, chapter: true },
      });
      if (!kp) return notFound(`No knowledge point found with id "${id}".`);

      const page =
        kp.sourcePage != null
          ? await prisma.materialPage.findUnique({
              where: { materialId_pageNumber: { materialId: kp.materialId, pageNumber: kp.sourcePage } },
            })
          : null;

      return text({
        id: kp.id,
        title: kp.title,
        content: kp.content,
        tags: kp.tags?.split(",").filter(Boolean) ?? [],
        confidence: kp.confidence,
        humanEdited: !kp.isAiGenerated,
        chapter: kp.chapter?.name ?? null,
        source: {
          materialId: kp.material.id,
          filename: kp.material.filename,
          page: kp.sourcePage,
          verbatimPageText: page?.rawText ?? null,
        },
      });
    }
  );

  server.registerTool(
    "search_questions",
    {
      title: "Search practice questions",
      description:
        "Browse practice/exam questions by course, chapter, and/or difficulty, optionally filtered by keyword. Returns question text and metadata only (no answer) — call get_question for the answer and explanation.",
      inputSchema: z.object({
        subject: z.string().optional(),
        chapter: z.string().optional(),
        difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
        query: z.string().optional(),
      }),
    },
    async ({ subject, chapter, difficulty, query }) => {
      let subjectId: string | undefined;
      let chapterId: string | undefined;
      if (subject) {
        const s = await resolveSubject(subject);
        if (!s) return notFound(`No course found matching "${subject}".`);
        subjectId = s.id;
        if (chapter) {
          const c = await resolveChapter(s.id, chapter);
          if (!c) return notFound(`No chapter found matching "${chapter}" in ${s.name}.`);
          chapterId = c.id;
        }
      }

      const results = await prisma.question.findMany({
        where: {
          stem: query ? { contains: query } : undefined,
          difficulty,
          chapterId,
          material: subjectId ? { subjectId } : undefined,
        },
        include: { material: { select: { id: true, filename: true } }, chapter: { select: { name: true } } },
        take: 25,
      });

      return text(
        results.map((q) => ({
          id: q.id,
          stem: q.stem,
          difficulty: q.difficulty,
          chapter: q.chapter?.name ?? null,
          sourceMaterialId: q.material?.id ?? null,
          sourceFilename: q.material?.filename ?? null,
          sourcePage: q.sourcePage,
          confidence: q.confidence,
        }))
      );
    }
  );

  server.registerTool(
    "get_question",
    {
      title: "Get question detail",
      description: "Full detail for one question by id, including its answer, explanation, and source citation.",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      const q = await prisma.question.findUnique({
        where: { id },
        include: { material: true, chapter: true },
      });
      if (!q) return notFound(`No question found with id "${id}".`);

      return text({
        id: q.id,
        stem: q.stem,
        options: q.options ? JSON.parse(q.options) : null,
        answer: q.answer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        chapter: q.chapter?.name ?? null,
        confidence: q.confidence,
        humanEdited: !q.isAiGenerated,
        source: q.material ? { materialId: q.material.id, filename: q.material.filename, page: q.sourcePage } : null,
      });
    }
  );

  server.registerTool(
    "get_source_excerpt",
    {
      title: "Get original source text",
      description:
        "Fetch the verbatim extracted text of one page (or, if page is omitted, a list of available pages) from an original uploaded material — the ground truth behind any knowledge point or question, for when you need to verify or quote it directly.",
      inputSchema: z.object({
        materialId: z.string(),
        page: z.number().int().optional().describe("Page number; omit to list available pages"),
      }),
    },
    async ({ materialId, page }) => {
      const material = await prisma.material.findUnique({ where: { id: materialId } });
      if (!material) return notFound(`No material found with id "${materialId}".`);

      if (page == null) {
        const pages = await prisma.materialPage.findMany({
          where: { materialId },
          select: { pageNumber: true },
          orderBy: { pageNumber: "asc" },
        });
        return text({
          materialId,
          filename: material.filename,
          summary: material.summary,
          availablePages: pages.map((p) => p.pageNumber),
        });
      }

      const pageRow = await prisma.materialPage.findUnique({
        where: { materialId_pageNumber: { materialId, pageNumber: page } },
      });
      if (!pageRow) return notFound(`Material "${material.filename}" has no page ${page}.`);

      return text({ materialId, filename: material.filename, page, text: pageRow.rawText });
    }
  );
}
