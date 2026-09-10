import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

const TOKEN_KEY = "mcp_token";

// Single static bearer token, generated on first use and stored alongside
// the AI provider settings. Good enough for a personal single-user server —
// swap for real OAuth before this app is ever multi-user.
export async function getOrCreateMcpToken(): Promise<string> {
  const existing = await prisma.setting.findUnique({ where: { key: TOKEN_KEY } });
  if (existing) return existing.value;
  const token = randomBytes(24).toString("base64url");
  await prisma.setting.create({ data: { key: TOKEN_KEY, value: token } });
  return token;
}

export async function regenerateMcpToken(): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await prisma.setting.upsert({
    where: { key: TOKEN_KEY },
    update: { value: token },
    create: { key: TOKEN_KEY, value: token },
  });
  return token;
}

export async function verifyMcpToken(authorizationHeader: string | null): Promise<boolean> {
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  const provided = authorizationHeader.slice("Bearer ".length);
  const expected = await getOrCreateMcpToken();
  return provided === expected;
}
