import { NextRequest, NextResponse } from "next/server";
import { auditLater } from "../../../../lib/audit";
import { clearAdminCookie, destroyAdminSession, getAdminSession } from "../../../../lib/auth/adminSession";

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (session) {
    await destroyAdminSession(session.tokenHash);
    auditLater(request, session, { action: "admin_logout" });
  }
  const response = NextResponse.json({ ok: true });
  clearAdminCookie(response);
  return response;
}
