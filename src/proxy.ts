import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, SESSION_COOKIE } from "./lib/auth/constants";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];
/** Email open-tracking images are loaded by recipients' mail apps, which have no session. */
const PUBLIC_PREFIXES = ["/api/o/"];
/** The admin portal has its own sign-in and cookie. */
const ADMIN_PUBLIC_PATHS = ["/admin/login", "/api/admin/login"];

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
}

/**
 * Fast first gate: without a session cookie, pages redirect to /login and API
 * calls get 401. Each page and API route still validates the session itself.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();

  if (isAdminPath(pathname)) {
    if (ADMIN_PUBLIC_PATHS.includes(pathname) || request.cookies.has(ADMIN_COOKIE)) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in to the admin portal", code: "admin_unauthenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

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
