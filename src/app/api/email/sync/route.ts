import { NextRequest, NextResponse } from "next/server";
import { auditLater } from "../../../../lib/audit";
import { requireSession } from "../../../../lib/auth/session";
import { getCompanyMailConfig } from "../../../../lib/mail/config";
import { syncMailboxes } from "../../../../lib/mail/sync";

export const maxDuration = 60;

/** Pulls new mail from this company's Inbox and Sent folders. */
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  if (!getCompanyMailConfig(session.companyId).imap) {
    return NextResponse.json(
      { error: "Your company's mailbox isn't connected yet. Ask your admin to add it.", code: "not_configured" },
      { status: 503 }
    );
  }

  try {
    const result = await syncMailboxes(session.companyId);
    if (result.imported > 0) {
      auditLater(request, session, { action: "mail_synced", details: { imported: result.imported, folders: result.folders } });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Email sync error:", error);
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: `Could not check the inbox: ${message}` }, { status: 502 });
  }
}
