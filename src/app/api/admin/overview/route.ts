import { NextRequest, NextResponse } from "next/server";
import type { AdminOverview } from "../../../../lib/adminTypes";
import { pool } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { COMPANIES } from "../../../../lib/companies";
import { getCompanyMailConfig } from "../../../../lib/mail/config";

/** Side-by-side numbers for each company plus overall totals. */
export async function GET(request: NextRequest) {
  const session = await requireSession(request, { admin: true });
  if (session instanceof NextResponse) return session;

  try {
    const [perCompany, totals] = await Promise.all([
      pool.query(
        `WITH companies(company_id) AS (SELECT unnest($1::text[]))
         SELECT c.company_id,
           (SELECT count(*)::int FROM auth_users u WHERE u.company_id = c.company_id AND u.is_active) AS users,
           (SELECT count(DISTINCT a.user_id)::int FROM audit_log a WHERE a.company_id = c.company_id AND a.created_at > now() - interval '7 days') AS active_users_7d,
           (SELECT count(*)::int FROM investor_company_data d WHERE d.company_id = c.company_id AND d.quality IS NOT NULL) AS rated,
           (SELECT count(*)::int FROM investor_company_data d WHERE d.company_id = c.company_id AND lower(d.quality) = 'high') AS rated_high,
           (SELECT count(*)::int FROM investor_company_data d WHERE d.company_id = c.company_id AND lower(d.quality) = 'low') AS rated_low,
           (SELECT count(*)::int FROM investor_company_data d WHERE d.company_id = c.company_id AND d.notes IS NOT NULL) AS notes,
           (SELECT count(*)::int FROM investor_activities x WHERE x.company_id = c.company_id AND x.kind = 'comment') AS comments,
           (SELECT count(*)::int FROM emails e WHERE e.company_id = c.company_id AND e.direction = 'outbound' AND e.status = 'sent') AS emails_sent,
           (SELECT count(*)::int FROM emails e WHERE e.company_id = c.company_id AND e.direction = 'inbound') AS emails_received,
           (SELECT coalesce(sum(inserted), 0)::int FROM lead_imports l WHERE l.company_id = c.company_id) AS leads_uploaded,
           (SELECT count(*)::int FROM audit_log a WHERE a.company_id = c.company_id AND a.created_at > now() - interval '7 days') AS actions_7d,
           (SELECT max(created_at) FROM audit_log a WHERE a.company_id = c.company_id) AS last_activity_at
         FROM companies c`,
        [COMPANIES.map((company) => company.id)]
      ),
      pool.query(
        `SELECT
           (SELECT count(*)::int FROM investors) AS investors,
           (SELECT count(*)::int FROM investors WHERE source_company_id IS NOT NULL) AS uploaded_leads,
           (SELECT count(*)::int FROM audit_log WHERE created_at >= date_trunc('day', now())) AS actions_today,
           (SELECT count(*)::int FROM audit_log WHERE action = 'login_failed' AND created_at > now() - interval '7 days') AS failed_logins_7d,
           s.high, s.medium, s.low
         FROM (
           SELECT count(*) FILTER (WHERE score >= 2.5)::int AS high,
                  count(*) FILTER (WHERE score >= 1.5 AND score < 2.5)::int AS medium,
                  count(*) FILTER (WHERE score < 1.5)::int AS low
           FROM (
             SELECT avg(CASE lower(quality) WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END) AS score
             FROM investor_company_data WHERE quality IS NOT NULL GROUP BY investor_id
           ) scores WHERE score IS NOT NULL
         ) s`
      ),
    ]);

    const t = totals.rows[0];
    const overview: AdminOverview = {
      companies: perCompany.rows.map((row) => {
        const mail = getCompanyMailConfig(row.company_id);
        return {
          companyId: row.company_id,
          users: row.users,
          activeUsers7d: row.active_users_7d,
          rated: row.rated,
          ratedHigh: row.rated_high,
          ratedLow: row.rated_low,
          notes: row.notes,
          comments: row.comments,
          emailsSent: row.emails_sent,
          emailsReceived: row.emails_received,
          leadsUploaded: row.leads_uploaded,
          actions7d: row.actions_7d,
          lastActivityAt: row.last_activity_at,
          mailConnected: mail.smtp !== null,
          mailbox: mail.sender.address,
        };
      }),
      totals: {
        investors: t.investors,
        uploadedLeads: t.uploaded_leads,
        teamScore: { high: t.high, medium: t.medium, low: t.low },
        actionsToday: t.actions_today,
        failedLogins7d: t.failed_logins_7d,
      },
    };
    return NextResponse.json(overview);
  } catch (error) {
    console.error("Admin overview API error:", error);
    return NextResponse.json({ error: "Failed to load overview" }, { status: 500 });
  }
}
