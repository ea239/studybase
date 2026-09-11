import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "未配置 Google 登录" }, { status: 500 });

  const { credential } = await req.json().catch(() => ({ credential: "" }));
  if (typeof credential !== "string" || !credential) {
    return NextResponse.json({ error: "缺少凭据" }, { status: 400 });
  }

  let email: string | undefined;
  let name: string | undefined;
  let picture: string | undefined;
  try {
    // Checks the signature against Google's keys, plus audience and expiry.
    const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    // email_verified guards against a provider asserting an unconfirmed address.
    if (payload?.email_verified) {
      email = payload.email?.toLowerCase();
      name = payload.name;
      picture = payload.picture;
    }
  } catch {
    return NextResponse.json({ error: "Google 凭据校验失败" }, { status: 401 });
  }
  if (!email) return NextResponse.json({ error: "Google 账号缺少已验证邮箱" }, { status: 403 });

  // The owner is whoever OWNER_EMAIL names — approved on sight. Everyone else
  // is recorded as pending and stays locked out until the owner approves them.
  const isOwner = email === (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

  const user = await prisma.appUser.upsert({
    where: { email },
    update: { name, picture, lastSeenAt: new Date(), ...(isOwner ? { isOwner: true, approved: true } : {}) },
    create: { email, name, picture, isOwner, approved: isOwner },
  });

  if (!user.approved) {
    return NextResponse.json({ error: "pending", email }, { status: 403 });
  }

  const session = await createSession(user.email, user.isOwner);
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

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
