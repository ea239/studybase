import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// The app is reachable from the public internet through the tunnel, so
// everything requires a session — except the MCP endpoint, which carries its
// own token and must stay reachable for ChatGPT/Claude connectors (their
// custom-connector UI can't send a session cookie or a custom header).
const PUBLIC_PREFIXES = ["/login", "/api/auth/", "/api/mcp"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // API callers get a status they can act on; page requests get the login form
  // with a pointer back to where they were headed.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
