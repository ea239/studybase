import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSession, passwordMatches } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));

  if (typeof password !== "string" || !passwordMatches(password)) {
    // Slows down guessing a little without needing shared rate-limit state.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "密码不正确" }, { status: 401 });
  }

  const session = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    // The tunnel terminates TLS, so the browser always sees HTTPS.
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
