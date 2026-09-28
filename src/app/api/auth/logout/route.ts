import { NextRequest, NextResponse } from "next/server";
import { auditLater } from "../../../../lib/audit";
import { clearSessionCookie, destroySession, getSession } from "../../../../lib/auth/session";

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (session) {
    await destroySession(session.tokenHash);
    auditLater(request, session, { action: "logout" });
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
