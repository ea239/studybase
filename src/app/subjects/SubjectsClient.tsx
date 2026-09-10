"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Chapter = { id: string; name: string };
type Course = { id: string; name: string; chapters: Chapter[] };
type Subject = { id: string; name: string; courses: Course[] };

export function SubjectsClient({ initialSubjects }: { initialSubjects: Subject[] }) {
  const router = useRouter();
  const [newSubject, setNewSubject] = useState("");
  const [newCourse, setNewCourse] = useState<Record<string, string>>({});
  const [newChapter, setNewChapter] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function addSubject() {
    if (!newSubject.trim()) return;
    setBusy(true);
    await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSubject.trim() }),
    });
    setNewSubject("");
    setBusy(false);
    router.refresh();
  }

  async function addCourse(subjectId: string) {
    const name = (newCourse[subjectId] ?? "").trim();
    if (!name) return;
    setBusy(true);
    await fetch(`/api/subjects/${subjectId}/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setNewCourse((s) => ({ ...s, [subjectId]: "" }));
    setBusy(false);
    router.refresh();
  }

  async function addChapter(courseId: string) {
    const name = (newChapter[courseId] ?? "").trim();
    if (!name) return;
    setBusy(true);
    await fetch(`/api/courses/${courseId}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setNewChapter((s) => ({ ...s, [courseId]: "" }));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <input
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          placeholder="新建科目，例如：数学"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          onClick={addSubject}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          新建科目
        </button>
      </div>

      {initialSubjects.length === 0 && (
        <p className="text-sm text-neutral-500">还没有科目，先创建一个吧。</p>
      )}

      <div className="flex flex-col gap-4">
        {initialSubjects.map((subject) => (
          <div key={subject.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{subject.name}</h3>
              <Link
                href={`/materials?subjectId=${subject.id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                查看资料 →
              </Link>
            </div>

            <div className="mt-3 flex flex-col gap-3 pl-4">
              {subject.courses.map((course) => (
                <div key={course.id} className="border-l-2 border-neutral-200 pl-3">
                  <div className="font-medium text-sm">{course.name}</div>
                  <ul className="mt-1 flex flex-col gap-1">
                    {course.chapters.map((ch) => (
                      <li key={ch.id} className="text-sm text-neutral-600">
                        · {ch.name}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={newChapter[course.id] ?? ""}
                      onChange={(e) => setNewChapter((s) => ({ ...s, [course.id]: e.target.value }))}
                      placeholder="新建章节"
                      className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => addChapter(course.id)}
                      disabled={busy}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
                    >
                      添加章节
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <input
                  value={newCourse[subject.id] ?? ""}
                  onChange={(e) => setNewCourse((s) => ({ ...s, [subject.id]: e.target.value }))}
                  placeholder="新建课程"
                  className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={() => addCourse(subject.id)}
                  disabled={busy}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                >
                  添加课程
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
