import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "../db";
import type { CompanyId } from "../companies";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };
const SESSION_DAYS = 30;
/** Only refresh last_seen_at this often, so reads don't turn into writes. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type Session = {
  tokenHash: string;
  userId: string;
  email: string;
  name: string | null;
  role: "admin" | "member";
  /** Workspace being viewed: always the account's own company. */
  companyId: CompanyId;
  /** Company the account belongs to. */
  homeCompanyId: CompanyId;
};

/** Safe subset sent to the browser. */
export type SessionUser = Omit<Session, "tokenHash" | "userId"> & { id: string };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, companyId: CompanyId): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO auth_sessions (token_hash, user_id, company_id, expires_at) VALUES ($1, $2, $3, $4)",
    [hashToken(token), userId, companyId, expires]
  );
  return { token, expires };
}

export function setSessionCookie(response: NextResponse, token: string, expires: Date) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/**
 * Short-lived in-memory cache of session lookups, so clicking around doesn't
 * cost a database round trip per request. Sign-out, deactivation, password
 * resets clear the affected entries immediately.
 */
const SESSION_CACHE_MS = 15_000;
const globalForSessions = globalThis as unknown as {
  sessionCache?: Map<string, { session: Session | null; expires: number }>;
};
const sessionCache = (globalForSessions.sessionCache ??= new Map());

/** Drop cached sessions for a token or for every session of a user. */
export function forgetCachedSessions(match: { tokenHash?: string; userId?: string }) {
  for (const [key, entry] of sessionCache) {
    if (key === match.tokenHash || (match.userId && entry.session?.userId === match.userId)) {
      sessionCache.delete(key);
    }
  }
}

async function sessionFromToken(token: string | undefined): Promise<Session | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = hashToken(token);

  const cached = sessionCache.get(tokenHash);
  if (cached && cached.expires > Date.now()) return cached.session ? { ...cached.session } : null;

  const session = await loadSession(tokenHash);
  if (sessionCache.size > 2000) sessionCache.clear();
  sessionCache.set(tokenHash, { session, expires: Date.now() + SESSION_CACHE_MS });
  return session ? { ...session } : null;
}

async function loadSession(tokenHash: string): Promise<Session | null> {
  const result = await pool.query<{
    user_id: string;
    email: string;
    name: string | null;
    role: "admin" | "member";
    home_company_id: CompanyId;
    last_seen_at: Date;
  }>(
    `SELECT s.user_id, s.last_seen_at, u.email, u.name, u.role, u.company_id AS home_company_id
     FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.kind = 'user' AND s.expires_at > now() AND u.is_active AND NOT u.is_super_admin`,
    [tokenHash]
  );
  const row = result.rows[0];
  if (!row) return null;

  if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_INTERVAL_MS) {
    pool.query("UPDATE auth_sessions SET last_seen_at = now() WHERE token_hash = $1", [tokenHash]).catch(() => undefined);
  }

  return {
    tokenHash,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    // Every account, admins included, only ever sees its own company's workspace.
    // To work in another company, sign out and sign in with that company's account.
    companyId: row.home_company_id,
    homeCompanyId: row.home_company_id,
  };
}

export async function getSession(request: NextRequest): Promise<Session | null> {
  return sessionFromToken(request.cookies.get(SESSION_COOKIE)?.value);
}

/** For Server Components (layout/pages). */
export async function getServerSession(): Promise<Session | null> {
  const store = await cookies();
  return sessionFromToken(store.get(SESSION_COOKIE)?.value);
}

/** Returns the session, or a 401/403 response to return from the route handler. */
export async function requireSession(
  request: NextRequest,
  options: { admin?: boolean } = {}
): Promise<Session | NextResponse> {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Please sign in again", code: "unauthenticated" }, { status: 401 });
  }
  if (options.admin && session.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  return session;
}

export function toSessionUser(session: Session): SessionUser {
  return {
    id: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    companyId: session.companyId,
    homeCompanyId: session.homeCompanyId,
  };
}

/** Name shown on timelines and in the audit log. */
export function actorName(session: Session): string {
  return session.name?.trim() || session.email;
}

export async function destroySession(tokenHash: string) {
  await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [tokenHash]);
  forgetCachedSessions({ tokenHash });
}
