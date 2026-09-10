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

// Accepts the token either as a normal "Authorization: Bearer <token>"
// header, or as a "?token=" query parameter. The header is what a proper
// MCP client sends; the query param exists because ChatGPT's custom
// connector UI currently only offers "No authentication" or full OAuth —
// no plain bearer-token field — so the only way to keep this endpoint from
// being a bare public URL is to fold the secret into the URL itself.
export async function verifyMcpRequest(req: Request): Promise<boolean> {
  const expected = await getOrCreateMcpToken();

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && authHeader.slice("Bearer ".length) === expected) {
    return true;
  }

  const url = new URL(req.url);
  return url.searchParams.get("token") === expected;
}
