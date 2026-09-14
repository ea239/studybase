import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { prisma } from "@/lib/db";
import { resolveSubject, resolveChapter } from "./lookup";
import { courseCatalogue, searchSubject } from "@/lib/subjectSearch";

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
        "List every course in StudyBase (each 'subject' is one specific course, e.g. 'ECE 356'), with its chapters and how many lecture/overview/lab materials it has. Call this first to discover what's available, then get_course_brief for the course the question is about.",
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
        "Per-document inventory of one course: chapters with their knowledge-point and question counts, the lab documents with their extracted facts, and the course-info points taken from syllabus documents. This is the raw extraction, document by document. For a question about the course itself — dates, grading, what to do for an assignment — use get_course_brief, get_chapter_notes or get_coursework_brief instead, which combine across documents.",
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

  // The tools above read what was extracted from one document at a time. The
  // ones below read what the app has already assembled across documents — a
  // chapter's notes, a piece of work's brief, the course's own shape. A course
  // states things in pieces (the task on one page, the rubric in another, the
  // weight in the syllabus), so a single document is usually the incomplete
  // answer, and these are the views that put it back together.

  server.registerTool(
    "get_course_brief",
    {
      title: "Get everything known about a course, assembled",
      description:
        "START HERE for any question about one course. Returns the course's key facts (instructor, grading breakdown, exam dates, policies) assembled from its syllabus, its chapters in order, and every assignment/lab/exam in date order with its due date. This is the app's own synthesis across all of the course's documents, so it answers 'when is the first assignment due' or 'what is the final worth' directly — no single uploaded file reliably contains these.",
      inputSchema: z.object({
        subject: z.string().describe("Subject id or name, e.g. 'ECE 356'"),
      }),
    },
    async ({ subject }) => {
      const found = await resolveSubject(subject);
      if (!found) return notFound(`No course matching "${subject}".`);
      return text({ subjectId: found.id, brief: await courseCatalogue(found.id) });
    }
  );

  server.registerTool(
    "get_chapter_notes",
    {
      title: "Get a chapter's written notes",
      description:
        "The app's own notes for one chapter, written from all of that chapter's material at once: sections of explanation, each point also given as a one-line summary, every point citing the document and page it came from. Prefer this over reading raw pages when explaining a topic — the raw pages are slide fragments, these are joined up. Returns both an explanatory form and a condensed form of the same points.",
      inputSchema: z.object({
        subject: z.string().describe("Subject id or name"),
        chapter: z.string().describe("Chapter id or name, e.g. 'Chapter 3' or 'Transport Layer'"),
        language: z
          .enum(["en", "zh", "both"])
          .optional()
          .describe("Which language to return; defaults to both"),
      }),
    },
    async ({ subject, chapter, language }) => {
      const foundSubject = await resolveSubject(subject);
      if (!foundSubject) return notFound(`No course matching "${subject}".`);
      const foundChapter = await resolveChapter(foundSubject.id, chapter);
      if (!foundChapter) {
        return notFound(`No chapter matching "${chapter}" in ${foundSubject.name}.`);
      }
      if (!foundChapter.overview) {
        return notFound(
          `Chapter "${foundChapter.name}" has no notes written yet. Use search_knowledge for its raw extracted points.`
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(foundChapter.overview);
      } catch {
        return notFound(`Notes for "${foundChapter.name}" could not be read.`);
      }
      const notes = parsed as {
        version?: number;
        sections?: {
          heading: { en: string; zh: string };
          bullets: {
            text: { en: string; zh: string };
            brief?: { en: string; zh: string };
            sources: { materialId: string; materialName: string; sourcePage: number | null }[];
          }[];
        }[];
      };
      if (notes.version !== 2 || !notes.sections) {
        return notFound(`Notes for "${foundChapter.name}" are in an older format; regenerate them in the app.`);
      }

      const lang = language ?? "both";
      const pick = (v: { en: string; zh: string } | undefined) =>
        v == null ? undefined : lang === "both" ? v : v[lang];

      return text({
        subject: foundSubject.name,
        chapter: foundChapter.name,
        generatedAt: foundChapter.overviewGeneratedAt,
        sections: notes.sections.map((section) => ({
          heading: pick(section.heading),
          points: section.bullets.map((b) => ({
            explanation: pick(b.text),
            summary: pick(b.brief),
            sources: b.sources,
          })),
        })),
      });
    }
  );

  server.registerTool(
    "list_coursework",
    {
      title: "List a course's assignments, labs and exams",
      description:
        "Everything with a due date in one course, in date order: assignments, labs, exams. Each says whether its date is fixed or only a window the course has not pinned down, whether it has been marked done, and whether a written brief is available via get_coursework_brief. Use this to resolve references like 'the first assignment' or 'the next lab', which no document spells out.",
      inputSchema: z.object({
        subject: z.string().describe("Subject id or name"),
        includeDone: z.boolean().optional().describe("Include items already marked done; defaults to true"),
      }),
    },
    async ({ subject, includeDone }) => {
      const found = await resolveSubject(subject);
      if (!found) return notFound(`No course matching "${subject}".`);

      const events = await prisma.courseEvent.findMany({
        where: {
          subjectId: found.id,
          kind: { not: "OTHER" },
          ...(includeDone === false ? { completedAt: null } : {}),
        },
        orderBy: [{ startsAt: "asc" }],
      });

      return text({
        subject: found.name,
        coursework: events.map((e, i) => ({
          position: i + 1,
          id: e.id,
          title: e.title,
          kind: e.kind,
          // Spelled out because a window is not a deadline, and treating one
          // as the other is how a wrong date gets quoted with confidence.
          dateCertainty:
            e.precision === "EXACT"
              ? "fixed"
              : e.precision === "RANGE"
                ? "window, exact date not announced"
                : "not announced",
          dueAt: e.startsAt,
          windowEndsAt: e.endsAt,
          approxLabel: e.approxLabel,
          completed: Boolean(e.completedAt),
          hasBrief: Boolean(e.brief),
        })),
      });
    }
  );

  server.registerTool(
    "get_coursework_brief",
    {
      title: "Get the written brief for one assignment, lab or exam",
      description:
        "What one piece of work asks for, assembled from the course's own documents: the task itself, what to hand in, how it is marked, and the dates and policies around it — drawn from the assignment page, the shared rubric or guidelines, and the course outline together, each point citing where it came from. Use this rather than reading the assignment's own file, which typically states the task but not the rubric, weight or late policy.",
      inputSchema: z.object({
        courseworkId: z.string().describe("Id from list_coursework"),
      }),
    },
    async ({ courseworkId }) => {
      const event = await prisma.courseEvent.findUnique({
        where: { id: courseworkId },
        include: { subject: { select: { name: true } } },
      });
      if (!event) return notFound(`No coursework with id "${courseworkId}".`);
      if (!event.brief) {
        return notFound(
          `"${event.title}" has no brief written yet — open it in StudyBase and press 整理这项作业, or use search_materials on its name.`
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.brief);
      } catch {
        return notFound(`The brief for "${event.title}" could not be read.`);
      }
      const brief = parsed as { version?: number; summary?: string; sections?: unknown };
      if (brief.version !== 1) {
        return notFound(`The brief for "${event.title}" is in an older format; regenerate it in the app.`);
      }

      return text({
        subject: event.subject.name,
        title: event.title,
        kind: event.kind,
        dueAt: event.startsAt,
        completed: Boolean(event.completedAt),
        generatedAt: event.briefGeneratedAt,
        summary: brief.summary,
        sections: brief.sections,
      });
    }
  );

  server.registerTool(
    "search_materials",
    {
      title: "Search everything in a course",
      description:
        "Full-text search across one course at once: extracted knowledge points, the raw text of every document page, and the dated items. Returns the matching passages with their source. Broader than search_knowledge, which only covers extracted points — use this when the answer might be a sentence in a syllabus or lab sheet that no knowledge point covers, such as a policy. Matching is literal, so pass several phrasings, and in both English and Chinese if the course's documents might be in either.",
      inputSchema: z.object({
        subject: z.string().describe("Subject id or name"),
        query: z.string().describe("What to look for"),
        alsoTry: z
          .array(z.string())
          .optional()
          .describe("Extra terms, synonyms and translations to match as well"),
      }),
    },
    async ({ subject, query, alsoTry }) => {
      const found = await resolveSubject(subject);
      if (!found) return notFound(`No course matching "${subject}".`);

      const hits = await searchSubject(found.id, query, alsoTry ?? []);
      if (hits.length === 0) {
        return text({
          subject: found.name,
          hits: [],
          note: "Nothing matched. Matching is literal — try other wordings, or the other language. get_course_brief covers dates, grading and structure without needing a match.",
        });
      }

      return text({
        subject: found.name,
        hits: hits.map((h) => ({
          kind: h.kind,
          title: h.title,
          source: h.materialName,
          page: h.sourcePage,
          text: h.text,
        })),
      });
    }
  );
}
