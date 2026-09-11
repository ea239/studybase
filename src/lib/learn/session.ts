import { readFile } from "fs/promises";
import path from "path";

// LEARN is UWaterloo's D2L Brightspace. There is no student-obtainable API
// key (Valence keys are issued to the institution), so the only way in is to
// reuse a real browser session the owner established themselves — including
// the Duo prompt. `scripts/learn-login.mjs` writes that session here in
// Playwright's storageState format; this module is the read side.
export const LEARN_HOST = process.env.LEARN_HOST ?? "learn.uwaterloo.ca";
export const LEARN_ORIGIN = `https://${LEARN_HOST}`;

const SESSION_FILE = path.join(process.cwd(), "data", "learn-session.json");

type StoredCookie = { name: string; value: string; domain: string; expires?: number };
type StorageState = { cookies?: StoredCookie[] };

export type LearnSession = {
  cookieHeader: string;
  /** Earliest expiry among the session cookies, or null if they are session-scoped. */
  expiresAt: Date | null;
};

// Brightspace splits its session across these two: the plain one identifies
// the session, the secure one authorises it. Missing either means "not
// logged in" no matter what else the file contains.
const REQUIRED = ["d2lSessionVal", "d2lSecureSessionVal"];

export async function readLearnSession(): Promise<LearnSession | null> {
  let state: StorageState;
  try {
    state = JSON.parse(await readFile(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }

  // Cookie domains may be ".uwaterloo.ca" or the exact host; both apply here.
  const cookies = (state.cookies ?? []).filter((c) => {
    const d = c.domain.replace(/^\./, "");
    return LEARN_HOST === d || LEARN_HOST.endsWith(`.${d}`);
  });
  if (!REQUIRED.every((n) => cookies.some((c) => c.name === n))) return null;

  // -1 is Playwright's "session cookie, no expiry" marker.
  const stamps = cookies.map((c) => c.expires ?? -1).filter((e) => e > 0);
  const expiresAt = stamps.length ? new Date(Math.min(...stamps) * 1000) : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) return null;

  return {
    cookieHeader: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    expiresAt,
  };
}

export { SESSION_FILE as LEARN_SESSION_FILE };
