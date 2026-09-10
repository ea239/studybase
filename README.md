# StudyBase 学库

AI 学习资料库 — 阶段一（MVP）。

## 当前范围

- 上传 PDF 或 HTML 网页，自动提取原文（PDF 逐页，HTML 作为单页）
- 上传时区分三类资料：「课程资料」（讲义/笔记/题目）、「课程大纲/评分说明/课表」、「实验/作业说明」，AI 按不同结构分别提取
- 配置 AI 服务（OpenAI / Anthropic / 自定义 OpenAI 兼容接口）后，自动提取摘要、知识点、题目，并保留页码出处
- 手动指定科目（= 一门具体课，如 ECE 356）/ 章节（暂不支持 AI 自动分类）
- 科目主页（`/subjects/[id]`）聚合这门课下所有资料，分 Lecture 大纲、练习题、Lab、课程信息 四个视图，每一项都能点开看详细内容和来源文件/页码
- 知识点 / 题目可人工编辑，人工编辑过的内容不会被重新处理覆盖
- 关键词搜索（资料标题、知识点、题目）
- 原文件永久保留，可随时查看

尚未支持：PPT/Word/图片(OCR)、语义检索、错题本/组卷/间隔复习、GPT 插件与 MCP 接入 —— 见项目规划的阶段二、三。

## 开发

```bash
npm install
npx prisma migrate dev   # 首次运行，创建本地 SQLite 数据库
npm run dev
```

打开 http://localhost:3000。先去「设置」页配置 AI 服务的 API Key，再到「资料库」上传 PDF。

## 技术栈

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + SQLite（本地文件数据库，personal use；后续可迁移到 Postgres）
- 文件存储：本地文件系统 `src/data/uploads`（后续可迁移到 S3 / R2）
- PDF 解析：`pdf-parse`；HTML 解析：`cheerio`
- AI：`openai` SDK（兼容 OpenAI 及自定义端点）与 `@anthropic-ai/sdk`

## 已知限制

- 单用户，无登录鉴权
- AI API Key 明文存储在本地数据库中
- 处理任务在请求进程内同步运行，无队列，不适合大文件/高并发
- 单次提取限制在约 6 万字符以内，超长文档会被截断（暂未分块）
- 扫描版 PDF（图片）无法提取文字，需要 OCR（未实现）
