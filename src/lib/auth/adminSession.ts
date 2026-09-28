import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "../db";
import { ADMIN_COOKIE } from "./constants";

/**
 * The admin portal has its own sign-in (a super admin account such as
 * "admin@all"), separate from employee logins. Its sessions are stored with
 * kind = 'admin' and can never be used to open a company workspace, and
 * workspace sessions can never open the admin portal.
 */

const ADMIN_SESSION_HOURS = 12;

export type AdminSession = {
  tokenHash: string;
  userId: string;
  email: string;
  name: string | null;
  /** Admin actions are not tied to one company. */
  companyId: null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession(userId: string, homeCompanyId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO auth_sessions (token_hash, user_id, company_id, expires_at, kind) VALUES ($1, $2, $3, $4, 'admin')",
    [hashToken(token), userId, homeCompanyId, expires]
  );
  return { token, expires };
}

export function setAdminCookie(response: NextResponse, token: string, expires: Date) {
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

async function adminSessionFromToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const result = await pool.query<{ user_id: string; email: string; name: string | null }>(
    `SELECT s.user_id, u.email, u.name
     FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.kind = 'admin' AND s.expires_at > now()
       AND u.is_super_admin AND u.is_active`,
    [tokenHash]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { tokenHash, userId: row.user_id, email: row.email, name: row.name, companyId: null };
}

export async function getAdminSession(request: NextRequest): Promise<AdminSession | null> {
  return adminSessionFromToken(request.cookies.get(ADMIN_COOKIE)?.value);
}

/** Returns the admin session, or a 401 response to return from the route handler. */
export async function requireAdmin(request: NextRequest): Promise<AdminSession | NextResponse> {
  const session = await getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Please sign in to the admin portal", code: "admin_unauthenticated" }, { status: 401 });
  }
  return session;
}

/** For admin page server components: the admin session, or a redirect to the admin sign-in. */
export async function requireAdminPage(): Promise<AdminSession> {
  const store = await cookies();
  const session = await adminSessionFromToken(store.get(ADMIN_COOKIE)?.value);
  if (!session) redirect("/admin/login");
  return session;
}

export async function getServerAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return adminSessionFromToken(store.get(ADMIN_COOKIE)?.value);
}

export async function destroyAdminSession(tokenHash: string) {
  await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1 AND kind = 'admin'", [tokenHash]);
}
