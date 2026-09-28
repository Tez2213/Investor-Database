import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { auditLater } from "../../../../lib/audit";
import { COMPANIES, companyForEmail, type CompanyId } from "../../../../lib/companies";
import { burnPasswordCheck, verifyPassword } from "../../../../lib/auth/password";
import { createSession, setSessionCookie, toSessionUser } from "../../../../lib/auth/session";

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;
const WRONG_CREDENTIALS = "Email or password is incorrect";

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || email.length > 200 || password.length > 200) {
    return NextResponse.json({ error: "Enter your email and password" }, { status: 400 });
  }

  const company = companyForEmail(email);
  if (!company) {
    auditLater(request, null, { action: "login_failed", email, details: { reason: "domain_not_allowed" } });
    const domains = COMPANIES.map((item) => `@${item.domain}`).join(", ");
    return NextResponse.json({ error: `Sign in with your company email (${domains})` }, { status: 401 });
  }

  const result = await pool.query<{
    id: string;
    password_hash: string;
    role: "admin" | "member";
    is_active: boolean;
    failed_attempts: number;
    locked_until: Date | null;
    company_id: CompanyId;
    name: string | null;
    access_mode: "all" | "assigned";
  }>(
    `SELECT id, password_hash, role, is_active, failed_attempts, locked_until, company_id, name, access_mode
     FROM auth_users WHERE email = $1`,
    [email]
  );
  const user = result.rows[0];

  if (!user) {
    await burnPasswordCheck(password);
    auditLater(request, null, { action: "login_failed", email, companyId: company.id, details: { reason: "no_account" } });
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 401 });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60_000);
    return NextResponse.json(
      { error: `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429 }
    );
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await pool.query(
      `UPDATE auth_users SET failed_attempts = $2,
         locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
       WHERE id = $1`,
      [user.id, lock ? 0 : attempts, lock, LOCK_MINUTES]
    );
    auditLater(request, null, {
      action: "login_failed",
      email,
      companyId: user.company_id,
      details: { reason: "wrong_password", locked: lock },
    });
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 401 });
  }

  if (!user.is_active) {
    auditLater(request, null, { action: "login_failed", email, companyId: user.company_id, details: { reason: "deactivated" } });
    return NextResponse.json({ error: "This account has been deactivated. Ask your admin for access." }, { status: 403 });
  }

  await pool.query(
    "UPDATE auth_users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1",
    [user.id]
  );
  const { token, expires } = await createSession(user.id, user.company_id);

  const session = {
    tokenHash: "",
    userId: user.id,
    email,
    name: user.name,
    role: user.role,
    companyId: user.company_id,
    homeCompanyId: user.company_id,
    accessMode: user.access_mode,
  };
  auditLater(request, session, { action: "login" });

  const response = NextResponse.json({ user: toSessionUser(session) });
  setSessionCookie(response, token, expires);
  return response;
}
