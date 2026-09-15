import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import { enqueueProcessMaterial } from "@/lib/pipeline";
import {
  LearnAuthError,
  LearnLockedError,
  downloadTopic,
  listCourses,
  listTopics,
  type LearnTopic,
} from "./client";
import type { MaterialType } from "@prisma/client";
import { materialTypeOf } from "@/lib/fileTypes";

// Everything else on LEARN (zip, mp4, sql, …) is skipped rather than imported
// as a dead row.
const fileTypeOf = materialTypeOf;

// LEARN's Url is the stored path, which carries the real extension — the
// topic Title often doesn't ("Lecture 1" vs "01-overview.pdf").
function filenameOf(topic: LearnTopic) {
  const fromUrl = topic.url ? decodeURIComponent(topic.url.split("?")[0].split("/").pop() ?? "") : "";
  return fromUrl || topic.title;
}

// Mirrors the category choice the owner would make by hand on the upload form,
// using the module the file sits in — LEARN课程基本都按这个分目录.
function categoryOf(topic: LearnTopic) {
  const hay = [...topic.modulePath, topic.title].join(" ").toLowerCase();
  // Tutorials and setup guides describe a procedure to follow rather than
  // teaching a topic, which is what the LAB prompt is written for.
  if (/\blab\b|assignment|homework|project|tutorial|setup|walkthrough/.test(hay)) return "LAB" as const;
  if (/syllabus|outline|logistics|grading|schedule|course info/.test(hay)) return "OVERVIEW" as const;
  return "NOTES" as const;
}

export type SyncReport = {
  course: string;
  imported: number;
  updated: number;
  /** Files already uploaded by hand that this run claimed instead of re-downloading. */
  adopted: number;
  /** Already held and unchanged since LEARN last touched them. */
  skipped: number;
  /**
   * Files LEARN has that the parser cannot read, by name.
   *
   * Counted apart from `skipped` because the two mean opposite things: one is
   * "nothing to do", the other is course material silently missing from the
   * app. A course outline posted as .ppt is how ECE 358 ended up with no dates
   * at all, and a single "skipped" tally gave no way to notice.
   */
  unsupported: string[];
  /**
   * Files LEARN lists but would not hand over, by name.
   *
   * A course can carry content entries whose file is gone — D2L answers 404
   * for them without marking them broken. One of those used to abort the whole
   * course, so a single missing file cost every other file behind it.
   */
  failed: { filename: string; reason: string }[];
  /**
   * Files the course has not released to this account yet, by name.
   *
   * Separate from `failed` because it is not a problem and needs no action:
   * an online course unlocks its modules as the term goes on, and each sync
   * simply tries again.
   */
  locked: string[];
  error?: string;
};

/** Refreshes the local mirror of the course list. Never deletes existing rows,
 *  so a course's subject mapping survives a term rollover. */
export async function refreshCourses() {
  const courses = await listCourses();
  for (const c of courses) {
    await prisma.learnCourse.upsert({
      where: { orgUnitId: c.orgUnitId },
      update: { name: c.name, code: c.code },
      create: { orgUnitId: c.orgUnitId, name: c.name, code: c.code },
    });
  }
  return courses.length;
}

async function syncCourse(course: {
  id: string;
  orgUnitId: string;
  name: string;
  subjectId: string | null;
}): Promise<SyncReport> {
  const report: SyncReport = {
    course: course.name,
    imported: 0,
    updated: 0,
    adopted: 0,
    skipped: 0,
    unsupported: [],
    failed: [],
    locked: [],
  };
  const topics = await listTopics(course.orgUnitId);

  for (const topic of topics) {
    const filename = filenameOf(topic);
    const fileType = fileTypeOf(filename);
    if (!fileType) {
      report.unsupported.push(filename);
      continue;
    }

    const existing = await prisma.material.findUnique({ where: { learnTopicId: topic.topicId } });
    // Already have it, and LEARN hasn't touched it since — nothing to do. A
    // topic with no timestamp is treated as unchanged, so a course that omits
    // the field doesn't get re-downloaded on every run.
    if (
      existing &&
      (!topic.updatedAt ||
        (existing.learnUpdatedAt && existing.learnUpdatedAt >= topic.updatedAt))
    ) {
      report.skipped++;
      continue;
    }

    try {
      await importTopic(course, topic, filename, fileType, existing, report);
    } catch (err) {
      // A dead session fails every remaining file the same way, so that one
      // still stops the course; anything else costs only this file.
      if (err instanceof LearnAuthError) throw err;
      if (err instanceof LearnLockedError) {
        report.locked.push(filename);
        continue;
      }
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[learn] ${course.name} / ${filename} 导入失败:`, reason);
      report.failed.push({ filename, reason: reason.slice(0, 120) });
    }
  }

  return report;
}

/** Downloads one topic and files it, replacing the row when LEARN has a newer copy. */
async function importTopic(
  course: { id: string; orgUnitId: string; name: string; subjectId: string | null },
  topic: LearnTopic,
  filename: string,
  fileType: MaterialType,
  existing: { id: string } | null,
  report: SyncReport
) {
  // The same file may already be here from a manual upload, from before this
  // course was ever synced. Claim that row rather than downloading a second
  // copy — re-parsing it would also burn AI quota on work already done.
  if (!existing) {
    const manual = await prisma.material.findFirst({
      where: { filename, subjectId: course.subjectId, learnTopicId: null },
    });
    if (manual) {
      await prisma.material.update({
        where: { id: manual.id },
        data: { learnTopicId: topic.topicId, learnUpdatedAt: topic.updatedAt },
      });
      report.adopted++;
      return;
    }
  }

  const buffer = await downloadTopic(course.orgUnitId, topic.topicId, topic.url);

  if (existing) {
    // Re-uploaded by the instructor: replace the file and re-run the parse,
    // keeping the same row so notes and citations keep pointing at it.
    const storagePath = await saveUpload(existing.id, filename, buffer);
    await prisma.material.update({
      where: { id: existing.id },
      data: {
        filename,
        storagePath,
        fileType,
        status: "PENDING",
        errorMessage: null,
        learnUpdatedAt: topic.updatedAt,
      },
    });
    void enqueueProcessMaterial(existing.id);
    report.updated++;
    return;
  }

  // chapterId is left null on purpose: the pipeline's chapter resolver reads
  // the document itself, which beats guessing from LEARN's module names.
  const material = await prisma.material.create({
    data: {
      filename,
      storagePath: "",
      fileType,
      category: categoryOf(topic),
      status: "PENDING",
      subjectId: course.subjectId,
      learnTopicId: topic.topicId,
      learnUpdatedAt: topic.updatedAt,
    },
  });
  const storagePath = await saveUpload(material.id, filename, buffer);
  await prisma.material.update({ where: { id: material.id }, data: { storagePath } });
  void enqueueProcessMaterial(material.id);
  report.imported++;
}

/** Syncs every enabled, subject-mapped course. One course failing does not
 *  abort the rest — each course records its own outcome. */
export async function syncEnabledCourses(): Promise<SyncReport[]> {
  const courses = await prisma.learnCourse.findMany({
  where: { enabled: true, subjectId: { not: null } },
  });

  const reports: SyncReport[] = [];
  for (const course of courses) {
  try {
    const report = await syncCourse(course);
    reports.push(report);
    await prisma.learnCourse.update({
      where: { id: course.id },
      data: {
        lastSyncedAt: new Date(),
        lastResult:
          `新增 ${report.imported} · 更新 ${report.updated} · 认领 ${report.adopted} · 未变 ${report.skipped}` +
          (report.unsupported.length
            ? ` · 格式不支持 ${report.unsupported.length}：${report.unsupported.join("、")}`
            : "") +
          (report.locked.length
            ? ` · 尚未开放 ${report.locked.length}：${report.locked.join("、")}`
            : "") +
          (report.failed.length
            ? ` · 下载失败 ${report.failed.length}：${report.failed.map((f) => f.filename).join("、")}`
            : ""),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reports.push({
      course: course.name,
      imported: 0,
      updated: 0,
      adopted: 0,
      skipped: 0,
      unsupported: [],
      failed: [],
      locked: [],
      error: message,
    });
    await prisma.learnCourse.update({
      where: { id: course.id },
      data: { lastSyncedAt: new Date(), lastResult: `失败：${message}` },
    });
    // A dead session will fail every remaining course the same way.
    if (err instanceof LearnAuthError) break;
  }
  }
  return reports;
}
