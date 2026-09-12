import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { officePdfBuffer } from "@/lib/office";
import { extractPdfPages } from "@/lib/pdf";
import { extractHtmlPages } from "@/lib/html";
import { extractStructuredContent } from "@/lib/ai/extract";
import { getAiSettings } from "@/lib/ai/settings";
import type { AiSettings } from "@/lib/ai/types";
import { resolveChapter } from "@/lib/chapter-resolver";
import { generateChapterOverview } from "@/lib/ai/chapterOverview";
import { extractCourseEvents } from "@/lib/ai/courseEvents";

// Extraction below this confidence gets flagged for human review instead of
// being silently trusted — see the "AI 分类可能出错" concern in the plan.
const REVIEW_THRESHOLD = 0.6;

// Materials are processed one at a time. Two reasons this must not run in
// parallel: resolveChapter's dedupe cache is per-call, so concurrent runs on
// the same subject would each create their own "Chapter 3" row; and a batch
// upload would otherwise fire N simultaneous AI requests.
// Backstop for the serial queue, and only that: a hang the AI client fails to
// catch must not hold the documents behind it forever.
//
// It deliberately does not double as a throughput limit. A long document is
// extracted in parts, each part bounded by the AI client's own timeout, so a
// 44-page one legitimately takes far longer than a lecture — and cutting it
// off part-way would throw away the parts that already succeeded.
const JOB_TIMEOUT_MS = 45 * 60 * 1000;

let queue: Promise<unknown> = Promise.resolve();
let inFlight = 0;
const chaptersNeedingNotes = new Set<string>();

export function enqueueProcessMaterial(materialId: string) {
  inFlight++;

  const run = async () => {
    try {
      await withTimeout(processMaterial(materialId), JOB_TIMEOUT_MS);
    } catch (err) {
      // processMaterial records its own failures on the row. This catches the
      // ones it cannot — a write that fails while it is writing the failure —
      // so the job still ends visibly rather than disappearing.
      console.error(`[pipeline] ${materialId} 处理失败:`, err);
      await prisma.material
        .update({
          where: { id: materialId },
          data: {
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : "处理失败，原因未知",
          },
        })
        .catch(() => {});
    }

    inFlight--;
    // Only once the whole batch is done, so a chapter touched by several
    // files in one upload is written once rather than after every file.
    if (inFlight === 0) {
      try {
        await pruneEmptyChapters();
        await flushChapterNotes();
      } catch (err) {
        console.error("[pipeline] 章节收尾失败:", err);
      }
    }
  };

  // Chained on settlement rather than on success, and `run` itself never
  // rejects. Both matter: `.then(fn)` on a rejected promise skips fn entirely,
  // so a queue that ever settles rejected silently drops every job chained
  // onto it afterwards — and since the dropped job still decrements inFlight
  // and re-runs the notes step, one failure there poisons the queue again on
  // its way out, permanently.
  queue = queue.then(run, run);
  return queue;
}

// Rejects once the deadline passes. The underlying work is not cancelled — it
// cannot be — but it stops holding up the queue, and whatever it writes when
// it eventually finishes is still correct.
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`处理超时（超过 ${Math.round(ms / 60000)} 分钟），已跳过`)),
      ms
    );
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Rebuilds the calendar entries this document contributes.
 *
 * Only the facts already tagged as schedules or deadlines are sent, so a
 * lecture deck costs nothing here. Failure is contained: a document that
 * parsed fine should not be marked failed because its dates could not be read,
 * and its old events are left in place rather than dropped.
 */
async function refreshCourseEvents(materialId: string, subjectId: string | null, settings: AiSettings) {
  if (!subjectId) return;

  const facts = await prisma.knowledgePoint.findMany({
    where: {
      materialId,
      OR: [{ tags: { contains: "deadline" } }, { tags: { contains: "schedule" } }],
    },
    select: { title: true, content: true, sourcePage: true },
  });
  if (facts.length === 0) {
    await prisma.courseEvent.deleteMany({ where: { materialId } });
    return;
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } });

  try {
    const events = await extractCourseEvents(settings, subject?.name ?? "", facts);
    // Replaced as a unit, after the extraction succeeds, so a failure cannot
    // empty the calendar.
    await prisma.courseEvent.deleteMany({ where: { materialId } });
    if (events.length) {
      await prisma.courseEvent.createMany({
        data: events.map((e) => ({ ...e, materialId, subjectId })),
      });
    }
  } catch (err) {
    console.error(`[events] ${materialId} 日期提取失败:`, err);
  }
}

// Re-processing moves items to whichever chapter they resolve to now, which
// can leave the chapter they used to sit in holding nothing at all. Those are
// artefacts of a previous run, and left alone they accumulate in the sidebar
// as empty entries. Only chapters with no content of any kind are removed.
async function pruneEmptyChapters() {
  const { count } = await prisma.chapter.deleteMany({
    where: {
      knowledgePoints: { none: {} },
      questions: { none: {} },
      materials: { none: {} },
    },
  });
  if (count) console.log(`[pipeline] 清理了 ${count} 个空章节`);
}

// Chapter notes are written automatically after new material lands, so the
// reading view is usable without a manual per-chapter step.
async function flushChapterNotes() {
  const ids = [...chaptersNeedingNotes];
  chaptersNeedingNotes.clear();
  if (ids.length === 0) return;

  // Outside the per-chapter try below, so this one needs its own guard.
  const settings = await getAiSettings().catch((err) => {
    console.error("[chapter-notes] 读取 AI 设置失败:", err);
    return null;
  });
  if (!settings) return;

  for (const chapterId of ids) {
    try {
      const chapter = await prisma.chapter.findUnique({
        where: { id: chapterId },
        include: {
          knowledgePoints: {
            orderBy: { sourcePage: "asc" },
            include: { material: { select: { id: true, filename: true } } },
          },
        },
      });
      if (!chapter || chapter.knowledgePoints.length === 0) continue;

      const overview = await generateChapterOverview(
        settings,
        chapter.name,
        chapter.knowledgePoints.map((p) => ({
          title: p.title,
          content: p.content,
          materialId: p.material.id,
          materialName: p.material.filename,
          sourcePage: p.sourcePage,
        }))
      );
      await prisma.chapter.update({
        where: { id: chapterId },
        data: { overview: JSON.stringify(overview), overviewGeneratedAt: new Date() },
      });
    } catch (err) {
      // A chapter whose notes fail keeps its old ones (or none) and can still
      // be regenerated by hand — not worth failing the whole upload over. It
      // must still be logged, or a systematically failing step looks exactly
      // like a step that never ran.
      console.error(`[chapter-notes] ${chapterId} 生成失败:`, err);
    }
  }
}

// Processing lives in this process, so anything still marked PROCESSING when
// this process starts was orphaned by a previous one and will never finish.
// Called from the materials list endpoint (the first place staleness would be
// visible) rather than at import time, since this module is only loaded when
// an upload/reprocess route runs.
let sweptOrphans = false;

export async function settleOrphanedProcessing() {
  if (sweptOrphans) return;
  sweptOrphans = true;
  await prisma.material
    .updateMany({
      where: { status: "PROCESSING" },
      data: { status: "FAILED", errorMessage: "处理被中断（服务重启），请重新解析。" },
    })
    .catch(() => {});
}

export async function processMaterial(materialId: string) {
  await prisma.material.update({
    where: { id: materialId },
    data: { status: "PROCESSING", errorMessage: null },
  });

  try {
    const material = await prisma.material.findUniqueOrThrow({ where: { id: materialId } });
    // Office documents are converted to PDF first; everything after this point
    // only ever sees PDF or HTML.
    const fileBuffer =
      material.fileType === "OFFICE"
        ? await officePdfBuffer(material.id, material.storagePath)
        : await readUpload(material.storagePath);
    const pages =
      material.fileType === "HTML" ? await extractHtmlPages(fileBuffer) : await extractPdfPages(fileBuffer);

    if (pages.length === 0) {
      throw new Error(
        material.fileType === "HTML"
          ? "未能从该网页中提取到任何文本"
          : "未能从 PDF 中提取到任何文本（可能是扫描件，需要 OCR，暂不支持）"
      );
    }

    // Raw text is ground truth — replace any stale pages from a prior run,
    // but this never touches human-edited knowledge points/questions below.
    await prisma.materialPage.deleteMany({ where: { materialId } });
    await prisma.materialPage.createMany({
      data: pages.map((p) => ({
        materialId,
        pageNumber: p.pageNumber,
        rawText: p.text,
      })),
    });

    const aiSettings = await getAiSettings();
    if (!aiSettings || !aiSettings.apiKey || !aiSettings.model) {
      await prisma.material.update({
        where: { id: materialId },
        data: {
          status: "NEEDS_REVIEW",
          errorMessage: "尚未配置 AI 服务，已保存原文，但未生成知识点/题目。请前往设置页配置后重新处理。",
        },
      });
      return;
    }

    const result = await extractStructuredContent(aiSettings, pages, material.category);

    // Only AI-generated rows from a previous run are cleared; anything a
    // human edited should get its own "isAiGenerated: false" flag upstream
    // (edit endpoint) so it survives re-processing — not implemented yet in
    // phase 1, so re-processing a material currently replaces all AI content.
    await prisma.knowledgePoint.deleteMany({ where: { materialId, isAiGenerated: true } });
    await prisma.question.deleteMany({ where: { materialId, isAiGenerated: true } });

    // Chapter is auto-detected per item from headings/titles the AI found in
    // the source text — one PDF can span multiple chapters. A manually
    // chosen chapter at upload time always wins over auto-detection.
    // resolveChapter must run one at a time (not Promise.all): concurrent
    // calls for the same never-seen label would both create it and violate
    // the (subjectId, name) unique constraint.
    const chapterCache = new Map<string, string>();
    async function resolveItemChapter(label?: string | null): Promise<string | null> {
      if (material.chapterId) return material.chapterId;
      if (!label || !material.subjectId) return null;
      return resolveChapter(material.subjectId, label, chapterCache);
    }

    const kpChapterIds: (string | null)[] = [];
    for (const kp of result.knowledgePoints) {
      kpChapterIds.push(await resolveItemChapter(kp.chapter));
    }
    const qChapterIds: (string | null)[] = [];
    for (const q of result.questions) {
      qChapterIds.push(await resolveItemChapter(q.chapter));
    }

    await prisma.knowledgePoint.createMany({
      data: result.knowledgePoints.map((kp, i) => ({
        materialId,
        chapterId: kpChapterIds[i],
        title: kp.title,
        content: kp.content,
        sourcePage: kp.sourcePage ?? null,
        tags: kp.tags?.join(",") ?? "",
        confidence: kp.confidence ?? null,
        isAiGenerated: true,
      })),
    });

    // Any chapter that gained content needs its notes rewritten. Collected
    // here and flushed once the whole upload batch settles, so a chapter fed
    // by several files is only regenerated once.
    for (const id of kpChapterIds) {
      if (id) chaptersNeedingNotes.add(id);
    }

    await prisma.question.createMany({
      data: result.questions.map((q, i) => ({
        materialId,
        chapterId: qChapterIds[i],
        stem: q.stem,
        options: q.options ? JSON.stringify(q.options) : null,
        answer: q.answer,
        explanation: q.explanation ?? null,
        sourcePage: q.sourcePage ?? null,
        difficulty: q.difficulty ?? "MEDIUM",
        confidence: q.confidence ?? null,
        isAiGenerated: true,
      })),
    });

    // If the material itself has no chapter yet, adopt whichever chapter
    // most of its items resolved to, so material-level lists/filters (which
    // only show one chapter per material) have a sensible value too.
    if (!material.chapterId) {
      const counts = new Map<string, number>();
      for (const id of [...kpChapterIds, ...qChapterIds]) {
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      let topChapterId: string | null = null;
      let topCount = 0;
      for (const [chapterId, count] of counts) {
        if (count > topCount) {
          topChapterId = chapterId;
          topCount = count;
        }
      }
      if (topChapterId) {
        await prisma.material.update({ where: { id: materialId }, data: { chapterId: topChapterId } });
      }
    }

    await refreshCourseEvents(materialId, material.subjectId, aiSettings);

    const lowConfidence = [...result.knowledgePoints, ...result.questions].some(
      (item) => (item.confidence ?? 1) < REVIEW_THRESHOLD
    );

    await prisma.material.update({
      where: { id: materialId },
      data: {
        status: lowConfidence ? "NEEDS_REVIEW" : "DONE",
        summary: result.summary,
        errorMessage: lowConfidence
          ? "部分提取内容置信度较低，请人工核对后确认。"
          : null,
      },
    });
  } catch (err) {
    await prisma.material.update({
      where: { id: materialId },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "处理失败，原因未知",
      },
    });
  }
}
