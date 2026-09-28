import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { getCompanyMailConfig } from "../../../../lib/mail/config";
import type { EmailSetupStatus } from "../../../../lib/types";

/** Whether this company's mailbox is connected (never returns credentials), plus unread count. */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await pool.query<{ unread: string; last_synced_at: string | null }>(
      `SELECT (SELECT count(*) FROM emails WHERE company_id = $1 AND direction = 'inbound' AND NOT is_read) AS unread,
              (SELECT max(last_synced_at) FROM email_sync_state WHERE company_id = $1) AS last_synced_at`,
      [session.companyId]
    );
    const config = getCompanyMailConfig(session.companyId);
    const status: EmailSetupStatus = {
      smtpConfigured: config.smtp !== null,
      imapConfigured: config.imap !== null,
      fromAddress: config.sender.address,
      fromName: config.sender.name,
      lastSyncedAt: result.rows[0].last_synced_at,
      unread: Number(result.rows[0].unread),
    };
    return NextResponse.json(status);
  } catch (error) {
    console.error("Email status API error:", error);
    return NextResponse.json({ error: "Failed to load email status" }, { status: 500 });
  }
}
