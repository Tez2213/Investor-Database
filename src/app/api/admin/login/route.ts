import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { auditLater } from "../../../../lib/audit";
import { burnPasswordCheck, verifyPassword } from "../../../../lib/auth/password";
import { createAdminSession, setAdminCookie } from "../../../../lib/auth/adminSession";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 30;
const WRONG_CREDENTIALS = "Admin ID or password is incorrect";

/** Sign-in for the admin portal. Only super admin accounts (e.g. "admin@all") are accepted. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const adminId = typeof body?.id === "string" ? body.id.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!adminId || !password || adminId.length > 200 || password.length > 200) {
    return NextResponse.json({ error: "Enter the admin ID and password" }, { status: 400 });
  }

  const result = await pool.query<{
    id: string;
    password_hash: string;
    is_active: boolean;
    failed_attempts: number;
    locked_until: Date | null;
    company_id: string;
  }>(
    `SELECT id, password_hash, is_active, failed_attempts, locked_until, company_id
     FROM auth_users WHERE email = $1 AND is_super_admin`,
    [adminId]
  );
  const admin = result.rows[0];

  if (!admin) {
    await burnPasswordCheck(password);
    auditLater(request, null, { action: "admin_login_failed", email: adminId, details: { reason: "unknown_id" } });
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 401 });
  }

  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(admin.locked_until).getTime() - Date.now()) / 60_000);
    return NextResponse.json(
      { error: `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429 }
    );
  }

  if (!(await verifyPassword(password, admin.password_hash))) {
    const attempts = admin.failed_attempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await pool.query(
      `UPDATE auth_users SET failed_attempts = $2,
         locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
       WHERE id = $1`,
      [admin.id, lock ? 0 : attempts, lock, LOCK_MINUTES]
    );
    auditLater(request, null, { action: "admin_login_failed", email: adminId, details: { reason: "wrong_password", locked: lock } });
    return NextResponse.json({ error: WRONG_CREDENTIALS }, { status: 401 });
  }

  if (!admin.is_active) {
    return NextResponse.json({ error: "This admin account is disabled" }, { status: 403 });
  }

  await pool.query("UPDATE auth_users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1", [admin.id]);
  const { token, expires } = await createAdminSession(admin.id, admin.company_id);
  auditLater(request, { userId: admin.id, email: adminId, companyId: null }, { action: "admin_login" });

  const response = NextResponse.json({ ok: true });
  setAdminCookie(response, token, expires);
  return response;
}
