import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { extractPdfPages } from "@/lib/pdf";
import { extractStructuredContent } from "@/lib/ai/extract";
import { getAiSettings } from "@/lib/ai/settings";

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
    const pages = await extractPdfPages(fileBuffer);

    if (pages.length === 0) {
      throw new Error("未能从 PDF 中提取到任何文本（可能是扫描件，需要 OCR，暂不支持）");
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

    await prisma.knowledgePoint.createMany({
      data: result.knowledgePoints.map((kp) => ({
        materialId,
        chapterId: material.chapterId,
        title: kp.title,
        content: kp.content,
        sourcePage: kp.sourcePage ?? null,
        tags: kp.tags?.join(",") ?? "",
        confidence: kp.confidence ?? null,
        isAiGenerated: true,
      })),
    });

    await prisma.question.createMany({
      data: result.questions.map((q) => ({
        materialId,
        chapterId: material.chapterId,
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
