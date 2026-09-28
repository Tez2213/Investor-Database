import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/constants";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

/**
 * Fast first gate: without a session cookie, pages redirect to /login and API
 * calls get 401. Each page and API route still validates the session itself.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please sign in", code: "unauthenticated" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif)$).*)"],
};
