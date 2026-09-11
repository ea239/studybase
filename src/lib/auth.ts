// Session cookie signing. Runs in both the Edge middleware and Node route
// handlers, so it uses Web Crypto only — no node:crypto.

export const SESSION_COOKIE = "studybase_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/** Cookie value for a session that expires MAX_AGE_SECONDS from now. */
export async function createSession(): Promise<{ value: string; maxAge: number }> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = String(expires);
  return { value: `${payload}.${await sign(payload)}`, maxAge: MAX_AGE_SECONDS };
}

export async function verifySession(cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return false;

  const expected = await sign(payload);
  // Length-independent compare: bail before the loop only on length, which is
  // not secret, and never early-exit on a mismatched byte.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return false;

  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}

/** Constant-time-ish password comparison. */
export function passwordMatches(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected || input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
