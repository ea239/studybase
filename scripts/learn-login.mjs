// Opens a real browser so you can sign in to LEARN yourself — Waterloo SSO and
// the Duo prompt included — then saves the resulting session for the server.
//
//   npm run learn:login
//
// Tick "remember this device" at the Duo prompt: that is what decides whether
// the saved session lasts days or hours. Nothing here bypasses a login step;
// it only keeps the session you established.
import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const HOST = process.env.LEARN_HOST ?? "learn.uwaterloo.ca";
const OUT = path.join(process.cwd(), "data", "learn-session.json");
const TIMEOUT_MS = 10 * 60 * 1000;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

console.log(`打开 https://${HOST} ——请在浏览器里正常登录（含 Duo 验证）。`);
await page.goto(`https://${HOST}/d2l/home`);

// Done when Brightspace has actually issued both session cookies; polling for
// these is more reliable than watching the URL, which bounces through SSO.
const deadline = Date.now() + TIMEOUT_MS;
let ok = false;
while (Date.now() < deadline) {
  const cookies = await context.cookies();
  const names = new Set(cookies.map((c) => c.name));
  if (names.has("d2lSessionVal") && names.has("d2lSecureSessionVal")) {
    ok = true;
    break;
  }
  await page.waitForTimeout(1000);
}

if (!ok) {
  console.error("等待登录超时（10 分钟），没有拿到会话。");
  await browser.close();
  process.exit(1);
}

// Give SSO a moment to finish setting any trailing cookies before snapshotting.
await page.waitForTimeout(2000);
const state = await context.storageState();
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(state, null, 2), { mode: 0o600 });

const expiries = state.cookies.filter((c) => c.expires > 0).map((c) => c.expires);
console.log(`已保存会话到 ${OUT}`);
if (expiries.length) {
  console.log(`最早过期时间：${new Date(Math.min(...expiries) * 1000).toLocaleString()}`);
}
console.log("现在回到设置页，点「刷新课程列表」即可。");
await browser.close();
