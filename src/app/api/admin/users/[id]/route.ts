import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { auditLater } from "../../../../../lib/audit";
import { hashPassword, passwordProblem } from "../../../../../lib/auth/password";
import { forgetCachedSessions, requireSession } from "../../../../../lib/auth/session";
import { parseId } from "../../../../../lib/parseId";

/**
 * Admin changes to an account: name, role, active status, or a new password.
 * Deactivating or resetting a password signs that person out everywhere.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request, { admin: true });
  if (session instanceof NextResponse) return session;

  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: "Invalid user id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const target = await pool.query<{ email: string; company_id: string; role: string; is_active: boolean }>(
    "SELECT email, company_id, role, is_active FROM auth_users WHERE id = $1",
    [id]
  );
  const user = target.rows[0];
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const isSelf = String(id) === session.userId;
  const sets: string[] = [];
  const values: unknown[] = [id];
  const changed: Record<string, unknown> = {};
  let signOut = false;

  if ("name" in body) {
    if (body.name !== null && typeof body.name !== "string") return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    values.push(body.name?.trim().slice(0, 80) || null);
    sets.push(`name = $${values.length}`);
    changed.name = values[values.length - 1];
  }
  if ("role" in body) {
    if (body.role !== "admin" && body.role !== "member") return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (isSelf && body.role !== "admin") return NextResponse.json({ error: "You can't remove your own admin access" }, { status: 400 });
    values.push(body.role);
    sets.push(`role = $${values.length}`);
    changed.role = body.role;
  }
  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    if (isSelf && !body.is_active) return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });
    values.push(body.is_active);
    sets.push(`is_active = $${values.length}`);
    changed.is_active = body.is_active;
    if (!body.is_active) signOut = true;
  }
  if ("password" in body) {
    const problem = passwordProblem(body.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    values.push(await hashPassword(body.password));
    sets.push(`password_hash = $${values.length}, failed_attempts = 0, locked_until = NULL`);
    changed.password = "reset";
    signOut = !isSelf;
  }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  try {
    await pool.query(`UPDATE auth_users SET ${sets.join(", ")} WHERE id = $1`, values);
    if (signOut) await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [id]);
    // Role/name/status changes apply on the person's very next click.
    forgetCachedSessions({ userId: String(id) });
    auditLater(request, session, {
      action: "user_updated",
      companyId: user.company_id,
      details: { userId: String(id), email: user.email, ...changed },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update user API error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
