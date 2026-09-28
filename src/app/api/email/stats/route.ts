import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { investorAccessCondition } from "../../../../lib/access";
import type { EmailStats } from "../../../../lib/types";

const ALLOWED_DAYS = new Set([0, 7, 30, 90]);

/**
 * Outreach numbers for this company over the last N days (0 = all time):
 * emails sent, opened, received, and how many contacted investors replied.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const requested = Number(request.nextUrl.searchParams.get("days") ?? 30);
  const days = ALLOWED_DAYS.has(requested) ? requested : 30;

  const values: unknown[] = [session.companyId, days];
  // Members limited to assigned investors see numbers for their investors only.
  const access = investorAccessCondition(session, "investor_id", (value) => {
    values.push(value);
    return `$${values.length}`;
  });

  try {
    const result = await pool.query<{
      sent: string;
      failed: string;
      tracked: string;
      opened: string;
      received: string;
      contacted: string;
      replied: string;
    }>(
      `WITH period AS (
         SELECT * FROM emails
         WHERE company_id = $1 AND ($2::int = 0 OR occurred_at > now() - make_interval(days => $2::int))
           ${access ? `AND ${access}` : ""}
       ),
       first_contact AS (
         SELECT investor_id, min(occurred_at) AS first_sent_at
         FROM period
         WHERE direction = 'outbound' AND status = 'sent' AND investor_id IS NOT NULL
         GROUP BY investor_id
       )
       SELECT
         count(*) FILTER (WHERE direction = 'outbound' AND status = 'sent') AS sent,
         count(*) FILTER (WHERE status = 'failed') AS failed,
         count(*) FILTER (WHERE direction = 'outbound' AND status = 'sent' AND open_token IS NOT NULL) AS tracked,
         count(*) FILTER (WHERE direction = 'outbound' AND status = 'sent' AND opened_at IS NOT NULL) AS opened,
         count(*) FILTER (WHERE direction = 'inbound') AS received,
         (SELECT count(*) FROM first_contact) AS contacted,
         -- Contacted investors who wrote back after our first email.
         (SELECT count(*) FROM first_contact f
          WHERE EXISTS (
            SELECT 1 FROM emails r
            WHERE r.company_id = $1 AND r.direction = 'inbound'
              AND r.investor_id = f.investor_id AND r.occurred_at > f.first_sent_at
          )) AS replied
       FROM period`,
      values
    );
    const row = result.rows[0];
    const stats: EmailStats = {
      days,
      sent: Number(row.sent),
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
