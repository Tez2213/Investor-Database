import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import { REAL_REPLY, STATS_METRICS, statsCtes, statsParams, type StatsMetric } from "../../../../../lib/emailStatsQuery";
import type { StatsDetailRow } from "../../../../../lib/types";

const PAGE_SIZE = 100;

/**
 * One row per email (or reply) behind each number, with the address it went to
 * or came from, when, how often it was opened, and a short note.
 */
const ITEMS: Record<StatsMetric, string> = {
  sent: `SELECT investor_id, to_addresses[1] AS address, occurred_at AS at, 0 AS opens, NULL::text AS note
         FROM out_period WHERE status = 'sent'`,
  failed: `SELECT investor_id, coalesce(bounced_addresses[1], to_addresses[1]) AS address, occurred_at AS at, 0 AS opens,
                  CASE WHEN bounced_at IS NOT NULL THEN 'Bounced back' ELSE coalesce(error, 'Refused by the mail server') END AS note
           FROM out_period WHERE status = 'failed' OR bounced_at IS NOT NULL`,
  opened: `SELECT investor_id, to_addresses[1] AS address, coalesce(last_opened_at, opened_at) AS at, open_count AS opens, NULL::text AS note
           FROM out_period WHERE status = 'sent' AND bounced_at IS NULL AND opened_at IS NOT NULL`,
  replied: `SELECT r.investor_id, r.from_address AS address, r.occurred_at AS at, 0 AS opens, NULL::text AS note
            FROM first_contact f JOIN emails r ON ${REAL_REPLY} AND r.investor_id = f.investor_id AND r.occurred_at > f.first_at`,
  received: `SELECT investor_id, from_address AS address, occurred_at AS at, 0 AS opens,
                    CASE WHEN inbound_kind = 'auto_reply' THEN 'Auto-reply' END AS note
             FROM in_period WHERE inbound_kind IS DISTINCT FROM 'bounce'`,
};

/** The investors behind one inbox number (same period and Mine/Team as the number). */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const search = request.nextUrl.searchParams;
  const metric = search.get("metric") as StatsMetric;
  if (!STATS_METRICS.includes(metric)) return NextResponse.json({ error: "Unknown number" }, { status: 400 });
  const offset = Math.max(0, Math.min(Number(search.get("offset")) || 0, 100_000));

  const { days, scope } = statsParams(search);
  const { values, param, ctes } = statsCtes(session, days, scope);

  try {
    const result = await pool.query<StatsDetailRow & { total: string }>(
      `${ctes},
       items AS (${ITEMS[metric]}),
       grouped AS (
         -- One row per investor; mail to or from unknown addresses is grouped by address.
         SELECT investor_id,
                CASE WHEN investor_id IS NULL THEN address END AS group_address,
                min(address) AS address,
                count(*)::int AS count,
                max(at) AS last_at,
                sum(opens)::int AS opens,
                (array_agg(note ORDER BY at DESC))[1] AS note
         FROM items
         GROUP BY investor_id, CASE WHEN investor_id IS NULL THEN address END
       )
       SELECT g.investor_id, g.address, g.count, g.last_at, g.opens, g.note,
              nullif(trim(concat_ws(' ', i.first_name, i.last_name)), '') AS name,
              i.company_name, d.quality,
              count(*) OVER () AS total
       FROM grouped g
       LEFT JOIN investors i ON i.id = g.investor_id
       LEFT JOIN investor_company_data d ON d.investor_id = g.investor_id AND d.company_id = $1
       ORDER BY g.last_at DESC NULLS LAST
       LIMIT ${param(PAGE_SIZE + 1)} OFFSET ${param(offset)}`,
      values
    );
    const rows = result.rows.slice(0, PAGE_SIZE).map((row) => {
      const { total, ...rest } = row;
      void total;
      return rest;
    });
    return NextResponse.json({
      metric,
      days,
      scope,
      total: result.rows.length > 0 ? Number(result.rows[0].total) : 0,
      data: rows,
      nextOffset: result.rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
    });
  } catch (error) {
    console.error("Email stats details API error:", error);
    return NextResponse.json({ error: "Failed to load the list" }, { status: 500 });
  }
}
