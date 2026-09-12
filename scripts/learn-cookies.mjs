// Imports a LEARN session from a browser you are already signed in to — for
// headless servers, where scripts/learn-login.mjs has no display to open.
//
//   npm run learn:cookies
//
// Paste a "Copy as cURL" of any learn.uwaterloo.ca request (DevTools →
// Network → right-click → Copy → Copy as cURL). That carries the full Cookie
// header, including the HttpOnly cookie that document.cookie will not show.
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import readline from "readline";

const HOST = process.env.LEARN_HOST ?? "learn.uwaterloo.ca";
const OUT = path.join(process.cwd(), "data", "learn-session.json");
const REQUIRED = ["d2lSessionVal", "d2lSecureSessionVal"];

console.log("粘贴 Copy as cURL 的内容（或直接粘 Cookie 字符串），粘完按 Ctrl-D：\n");

const input = await new Promise((resolve) => {
  const chunks = [];
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (l) => chunks.push(l));
  rl.on("close", () => resolve(chunks.join("\n")));
});

// Accepts either a full cURL command (-H 'Cookie: …' or -b '…') or a bare
// "name=value; name=value" string.
const header =
  input.match(/-H\s+['"]cookie:\s*([^'"]+)['"]/i)?.[1] ??
  input.match(/-b\s+['"]([^'"]+)['"]/i)?.[1] ??
  (input.includes("=") && !input.trim().startsWith("curl") ? input.trim() : null);

if (!header) {
  console.error("没找到 Cookie —— 确认复制的是 Copy as cURL 的完整内容。");
  process.exit(1);
}

const cookies = header
  .split(";")
  .map((part) => part.trim())
  .filter(Boolean)
  .map((part) => {
    const eq = part.indexOf("=");
    return { name: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() };
  })
  .filter((c) => c.name);

const missing = REQUIRED.filter((n) => !cookies.some((c) => c.name === n));
if (missing.length) {
  console.error(`缺少 ${missing.join(" 和 ")} —— 你可能没登录，或复制的请求不是发往 ${HOST} 的。`);
  process.exit(1);
}

// Confirm the session actually works before writing it, so a stale paste
// fails here rather than silently at the next sync.
const res = await fetch(`https://${HOST}/d2l/api/lp/1.63/enrollments/myenrollments/?orgUnitTypeId=3`, {
  headers: { Accept: "application/json", Cookie: header },
  redirect: "manual",
});
if (res.status >= 300) {
  console.error(`LEARN 拒绝了这个会话（HTTP ${res.status}）—— 多半已过期，重新登录后再复制一次。`);
  process.exit(1);
}
const count = (await res.json()).Items?.length ?? 0;

// Playwright's storageState shape, so both import paths write the same file.
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify(
    { cookies: cookies.map((c) => ({ ...c, domain: HOST, path: "/", expires: -1 })), origins: [] },
    null,
    2
  ),
  { mode: 0o600 }
);

console.log(`\n会话有效，看到 ${count} 门课程。已保存到 ${OUT}`);
console.log("现在去设置页点「刷新课程列表」。");
