import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import { enqueueProcessMaterial } from "@/lib/pipeline";
import { LearnAuthError, downloadTopic, listCourses, listTopics, type LearnTopic } from "./client";

// The parse pipeline only understands these two today; everything else on
// LEARN (pptx, zip, mp4, …) is skipped rather than imported as a dead row.
function fileTypeOf(name: string) {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "PDF" as const;
  if (n.endsWith(".html") || n.endsWith(".htm")) return "HTML" as const;
  return null;
}

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
  if (/\blab\b|assignment|homework|project/.test(hay)) return "LAB" as const;
  if (/syllabus|outline|logistics|grading|schedule|course info/.test(hay)) return "OVERVIEW" as const;
  return "NOTES" as const;
}

export type SyncReport = {
  course: string;
  imported: number;
  updated: number;
  /** Files already uploaded by hand that this run claimed instead of re-downloading. */
  adopted: number;
  skipped: number;
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
  const report: SyncReport = { course: course.name, imported: 0, updated: 0, adopted: 0, skipped: 0 };
  const topics = await listTopics(course.orgUnitId);

  for (const topic of topics) {
    const filename = filenameOf(topic);
    const fileType = fileTypeOf(filename);
    if (!fileType) {
      report.skipped++;
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
        continue;
      }
    }

    const buffer = await downloadTopic(course.orgUnitId, topic.topicId);

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
      continue;
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

  return report;
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
          lastResult: `新增 ${report.imported} · 更新 ${report.updated} · 认领 ${report.adopted} · 跳过 ${report.skipped}`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reports.push({ course: course.name, imported: 0, updated: 0, adopted: 0, skipped: 0, error: message });
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
