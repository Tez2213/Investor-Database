import { NextRequest, NextResponse } from "next/server";
import type { AdminUserRow } from "../../../../lib/adminTypes";
import { pool } from "../../../../lib/db";
import { auditLater } from "../../../../lib/audit";
import { hashPassword, passwordProblem } from "../../../../lib/auth/password";
import { requireAdmin } from "../../../../lib/auth/adminSession";
import { COMPANIES, companyForEmail } from "../../../../lib/companies";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const result = await pool.query<AdminUserRow>(
    `SELECT u.id, u.email, u.name, u.company_id, u.role, u.is_active, u.created_at, u.created_by, u.last_login_at,
            u.access_mode,
            (SELECT count(*)::int FROM user_investor_assignments x WHERE x.user_id = u.id) AS assigned_count,
            (SELECT max(last_seen_at) FROM auth_sessions s WHERE s.user_id = u.id) AS last_seen_at,
            (SELECT count(*)::int FROM audit_log a WHERE a.user_id = u.id AND a.created_at > now() - interval '7 days') AS actions_7d
     FROM auth_users u
     WHERE NOT u.is_super_admin
     ORDER BY u.company_id, u.role, u.email`
  );
  return NextResponse.json({ data: result.rows });
}

/** Creates an employee login. The company comes from the email domain. */
export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) || null : null;
  const role = body?.role === "admin" ? "admin" : "member";
  // Admins always see every investor; members can start limited to assigned investors.
  const accessMode = role === "member" && body?.access_mode === "assigned" ? "assigned" : "all";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  const company = companyForEmail(email);
  if (!company) {
    const domains = COMPANIES.map((item) => `@${item.domain}`).join(", ");
    return NextResponse.json({ error: `Only company emails can be added (${domains})` }, { status: 400 });
  }
  const problem = passwordProblem(body?.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const created = await pool.query<{ id: string }>(
      `INSERT INTO auth_users (email, name, company_id, role, password_hash, created_by, access_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, name, company.id, role, await hashPassword(body.password), session.email, accessMode]
    );
    if (created.rowCount === 0) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    auditLater(request, session, {
      action: "user_created",
      companyId: company.id,
      details: { userId: created.rows[0].id, email, role, access_mode: accessMode },
    });
    return NextResponse.json({ data: { id: created.rows[0].id } }, { status: 201 });
  } catch (error) {
    console.error("Create user API error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
