// Session cookie signing. Runs in both the Edge middleware and Node route
// handlers, so it uses Web Crypto only — no node:crypto.

export const SESSION_COOKIE = "studybase_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Session = { email: string; owner: boolean; exp: number };

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(mac));
}

function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(email: string, owner: boolean) {
  const session: Session = { email, owner, exp: Date.now() + MAX_AGE_SECONDS * 1000 };
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  return { value: `${payload}.${await sign(payload)}`, maxAge: MAX_AGE_SECONDS };
}

/** Returns the session when the signature checks out and it hasn't expired. */
export async function readSession(cookie: string | undefined): Promise<Session | null> {
  if (!cookie) return null;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;
  if (!equals(await sign(payload), signature)) return null;

  try {
    const session = JSON.parse(fromBase64Url(payload)) as Session;
    if (!session.email || typeof session.exp !== "number" || session.exp <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}
