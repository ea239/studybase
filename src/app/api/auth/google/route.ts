import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { SESSION_COOKIE, createSession } from "@/lib/auth";

// Verifying the ID token proves the holder signed in with Google, not that
// they are allowed *here* — without an allowlist any Google account on earth
// would be a valid login. Unset means no one gets in this way.
function allowedEmails(): string[] {
  return (process.env.ALLOWED_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "未配置 Google 登录" }, { status: 500 });
  }

  const { credential } = await req.json().catch(() => ({ credential: "" }));
  if (typeof credential !== "string" || !credential) {
    return NextResponse.json({ error: "缺少凭据" }, { status: 400 });
  }

  let email: string | undefined;
  try {
    // Checks the signature against Google's keys, plus audience and expiry.
    const ticket = await new OAuth2Client(clientId).verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    // email_verified guards against a provider asserting an address it never
    // confirmed.
    if (payload?.email_verified) email = payload.email?.toLowerCase();
  } catch {
    return NextResponse.json({ error: "Google 凭据校验失败" }, { status: 401 });
  }

  const allowed = allowedEmails();
  if (!email || allowed.length === 0 || !allowed.includes(email)) {
    return NextResponse.json({ error: "该 Google 账号无权访问" }, { status: 403 });
  }

  const session = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: session.maxAge,
  });
  return res;
}
