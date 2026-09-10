export const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  PENDING: { text: "等待处理", className: "bg-neutral-200 text-neutral-700" },
  PROCESSING: { text: "正在解析", className: "bg-blue-100 text-blue-700" },
  DONE: { text: "已完成", className: "bg-green-100 text-green-700" },
  NEEDS_REVIEW: { text: "需要人工确认", className: "bg-amber-100 text-amber-800" },
  FAILED: { text: "处理失败", className: "bg-red-100 text-red-700" },
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: "简单",
  MEDIUM: "中等",
  HARD: "困难",
};

export const CATEGORY_LABELS: Record<string, { text: string; className: string }> = {
  NOTES: { text: "课程资料", className: "bg-neutral-100 text-neutral-600" },
  OVERVIEW: { text: "课程大纲/评分说明", className: "bg-purple-100 text-purple-700" },
};

// tags used on OVERVIEW-category knowledge points
export const OVERVIEW_TAG_LABELS: Record<string, string> = {
  "basic-info": "基本信息",
  schedule: "课程进度",
  grading: "评分说明",
  deadline: "重要日期",
};
