import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";

// The app is reachable from the public internet through the tunnel, so
// everything requires a session — except the MCP endpoint, which carries its
// own token and must stay reachable for ChatGPT/Claude connectors (their
// custom-connector UI can send neither a session cookie nor a custom header).
const PUBLIC_PREFIXES = ["/login", "/api/auth/", "/api/mcp"];

// Settings hold the AI credentials and the MCP token, and approving users is
// the owner's call — approved members get the study material, nothing more.
const OWNER_ONLY_PREFIXES = ["/settings", "/api/settings", "/api/users"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    // API callers get a status they can act on; page requests get the login
    // form with a pointer back to where they were headed.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (!session.owner && OWNER_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
