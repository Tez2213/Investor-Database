import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { investorAccessCondition } from "../../../../lib/access";
import type { EmailStats } from "../../../../lib/types";

const ALLOWED_DAYS = new Set([0, 7, 30, 90]);

/**
 * Outreach numbers over the last N days (0 = all time). scope=mine counts the
 * emails the signed-in person sent and the mail that came back on those
 * conversations; scope=team counts the whole company.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const params = request.nextUrl.searchParams;
  const requested = Number(params.get("days") ?? 30);
  const days = ALLOWED_DAYS.has(requested) ? requested : 30;
  const scope = params.get("scope") === "team" ? "team" : "mine";

  const values: unknown[] = [session.companyId, days, scope, session.userId];
  // Members limited to assigned investors see numbers for their investors only.
  const access = investorAccessCondition(session, "investor_id", (value) => {
    values.push(value);
    return `$${values.length}`;
  });
  const accessSql = access ? `AND ${access}` : "";
  const inPeriod = "($2::int = 0 OR occurred_at > now() - make_interval(days => $2::int))";

  try {
    const result = await pool.query<Record<"sent" | "delivered" | "failed" | "tracked" | "opened" | "received" | "contacted" | "replied", string>>(
      `WITH outgoing AS (
         SELECT * FROM emails
         WHERE company_id = $1 AND direction = 'outbound'
           AND ($3::text = 'team' OR sent_by_user_id = $4::bigint) ${accessSql}
       ),
       out_period AS (SELECT * FROM outgoing WHERE ${inPeriod}),
       in_period AS (
         SELECT * FROM emails
         WHERE company_id = $1 AND direction = 'inbound' AND ${inPeriod} ${accessSql}
           AND ($3::text = 'team' OR thread_id IN (SELECT thread_id FROM outgoing))
       ),
       -- Investors who got at least one email (sent and not bounced) in the period.
       first_contact AS (
         SELECT investor_id, min(occurred_at) AS first_at
         FROM out_period
         WHERE status = 'sent' AND bounced_at IS NULL AND investor_id IS NOT NULL
         GROUP BY investor_id
       )
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
          WHERE EXISTS (
            SELECT 1 FROM emails r
            WHERE r.company_id = $1 AND r.direction = 'inbound' AND r.inbound_kind IS NULL
              AND r.investor_id = f.investor_id AND r.occurred_at > f.first_at
          )) AS replied`,
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
