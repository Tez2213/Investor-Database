import type { Session } from "./auth/session";
import { investorAccessCondition } from "./access";

export const STATS_DAYS = new Set([0, 7, 30, 90]);
export type StatsScope = "mine" | "team";
export type StatsMetric = "sent" | "failed" | "opened" | "replied" | "received";
export const STATS_METRICS: StatsMetric[] = ["sent", "failed", "opened", "replied", "received"];

/** Reads ?days= and ?scope= the same way for the numbers and the lists behind them. */
export function statsParams(search: URLSearchParams): { days: number; scope: StatsScope } {
  const requested = Number(search.get("days") ?? 30);
  return {
    days: STATS_DAYS.has(requested) ? requested : 30,
    scope: search.get("scope") === "team" ? "team" : "mine",
  };
}

/**
 * The emails behind the inbox numbers, as SQL common table expressions:
 *   outgoing       emails sent by this person (scope=mine) or the company (team), any time
 *   out_period     those sent within the period
 *   in_period      mail received within the period (on this person's conversations for mine)
 *   first_contact  investors reached (sent, not bounced) in the period, with the first date
 * Members limited to assigned investors only see their investors.
 */
export function statsCtes(session: Session, days: number, scope: StatsScope) {
  const values: unknown[] = [session.companyId, days, scope, session.userId];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const access = investorAccessCondition(session, "investor_id", param);
  const accessSql = access ? `AND ${access}` : "";
  const inPeriod = "($2::int = 0 OR occurred_at > now() - make_interval(days => $2::int))";

  const ctes = `WITH outgoing AS (
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
    first_contact AS (
      SELECT investor_id, min(occurred_at) AS first_at
      FROM out_period
      WHERE status = 'sent' AND bounced_at IS NULL AND investor_id IS NOT NULL
      GROUP BY investor_id
    )`;
  return { values, param, ctes };
}

/** A real reply: from the investor themselves, not a bounce notice or out-of-office. */
export const REAL_REPLY = "r.company_id = $1 AND r.direction = 'inbound' AND r.inbound_kind IS NULL";
