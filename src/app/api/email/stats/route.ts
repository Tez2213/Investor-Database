import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { REAL_REPLY, statsCtes, statsParams } from "../../../../lib/emailStatsQuery";
import type { EmailStats } from "../../../../lib/types";

/**
 * Outreach numbers over the last N days (0 = all time). scope=mine counts the
 * emails the signed-in person sent and the mail that came back on those
 * conversations; scope=team counts the whole company.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const { days, scope } = statsParams(request.nextUrl.searchParams);
  const { values, ctes } = statsCtes(session, days, scope);

  try {
    const result = await pool.query<Record<"sent" | "delivered" | "failed" | "tracked" | "opened" | "received" | "contacted" | "replied", string>>(
      `${ctes}
       SELECT
         (SELECT count(*) FROM out_period WHERE status = 'sent') AS sent,
         (SELECT count(*) FROM out_period WHERE status = 'sent' AND bounced_at IS NULL) AS delivered,
         (SELECT count(*) FROM out_period WHERE status = 'failed' OR bounced_at IS NOT NULL) AS failed,
         (SELECT count(*) FROM out_period WHERE status = 'sent' AND bounced_at IS NULL AND open_token IS NOT NULL) AS tracked,
         (SELECT count(*) FROM out_period WHERE status = 'sent' AND bounced_at IS NULL AND opened_at IS NOT NULL) AS opened,
         (SELECT count(*) FROM in_period WHERE inbound_kind IS DISTINCT FROM 'bounce') AS received,
         (SELECT count(*) FROM first_contact) AS contacted,
         -- Reached investors who wrote back themselves (not a bounce or out-of-office) after our first email.
         (SELECT count(*) FROM first_contact f
          WHERE EXISTS (SELECT 1 FROM emails r WHERE ${REAL_REPLY} AND r.investor_id = f.investor_id AND r.occurred_at > f.first_at)
         ) AS replied`,
      values
    );
    const row = result.rows[0];
    const stats: EmailStats = {
      days,
      scope,
      sent: Number(row.sent),
      delivered: Number(row.delivered),
      failed: Number(row.failed),
      tracked: Number(row.tracked),
      opened: Number(row.opened),
      received: Number(row.received),
      investorsContacted: Number(row.contacted),
      investorsReplied: Number(row.replied),
    };
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Email stats API error:", error);
    return NextResponse.json({ error: "Failed to load email stats" }, { status: 500 });
  }
}
