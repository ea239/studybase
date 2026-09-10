import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { extractPdfPages } from "@/lib/pdf";
import { extractHtmlPages } from "@/lib/html";
import { extractStructuredContent } from "@/lib/ai/extract";
import { getAiSettings } from "@/lib/ai/settings";
import { resolveChapter } from "@/lib/chapter-resolver";

// Extraction below this confidence gets flagged for human review instead of
// being silently trusted — see the "AI 分类可能出错" concern in the plan.
const REVIEW_THRESHOLD = 0.6;

export async function processMaterial(materialId: string) {
  await prisma.material.update({
    where: { id: materialId },
    data: { status: "PROCESSING", errorMessage: null },
  });

  try {
    const material = await prisma.material.findUniqueOrThrow({ where: { id: materialId } });
    const fileBuffer = await readUpload(material.storagePath);
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
