import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { auditLater } from "../../../../lib/audit";
import { hashPassword, passwordProblem, verifyPassword } from "../../../../lib/auth/password";
import { forgetCachedSessions, requireSession, toSessionUser } from "../../../../lib/auth/session";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ user: toSessionUser(session) });
}

/** Update your own display name and/or password. */
export async function PATCH(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  let body: { name?: unknown; currentPassword?: unknown; newPassword?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if ("name" in body) {
    if (typeof body.name !== "string" || body.name.trim().length > 80) {
      return NextResponse.json({ error: "Name must be up to 80 characters" }, { status: 400 });
    }
    const name = body.name.trim() || null;
    await pool.query("UPDATE auth_users SET name = $2 WHERE id = $1", [session.userId, name]);
    auditLater(request, session, { action: "profile_name_changed", details: { name } });
    session.name = name;
  }

  if ("newPassword" in body) {
    const problem = passwordProblem(body.newPassword);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const current = await pool.query<{ password_hash: string }>("SELECT password_hash FROM auth_users WHERE id = $1", [
      session.userId,
    ]);
    const ok =
      typeof body.currentPassword === "string" &&
      current.rows[0] &&
      (await verifyPassword(body.currentPassword, current.rows[0].password_hash));
    if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    await pool.query("UPDATE auth_users SET password_hash = $2 WHERE id = $1", [
      session.userId,
      await hashPassword(body.newPassword as string),
    ]);
    // Sign out other devices; keep this one.
    await pool.query("DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash <> $2", [session.userId, session.tokenHash]);
    auditLater(request, session, { action: "password_changed" });
  }

  forgetCachedSessions({ userId: session.userId });
  return NextResponse.json({ user: toSessionUser(session) });
}
