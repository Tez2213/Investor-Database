import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { auditLater } from "../../../../lib/audit";
import { isCompanyId } from "../../../../lib/companies";
import { forgetCachedSessions, requireSession } from "../../../../lib/auth/session";

/** Admins switch which company's workspace they are looking at. */
export async function POST(request: NextRequest) {
  const session = await requireSession(request, { admin: true });
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => null);
  const companyId = body?.companyId;
  if (!isCompanyId(companyId)) {
    return NextResponse.json({ error: "Unknown company" }, { status: 400 });
  }

  await pool.query("UPDATE auth_sessions SET company_id = $2 WHERE token_hash = $1", [session.tokenHash, companyId]);
  forgetCachedSessions({ tokenHash: session.tokenHash });
  auditLater(request, session, { action: "workspace_switched", companyId, details: { from: session.companyId, to: companyId } });
  return NextResponse.json({ ok: true, companyId });
}
