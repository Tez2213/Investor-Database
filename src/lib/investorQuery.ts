import type { PoolClient } from "pg";
import { EDITABLE_FIELDS, type Investor } from "./types";

type Queryable = Pick<PoolClient, "query">;

/** Shared columns of the investors table (same for every company). */
export const SHARED_COLUMNS = EDITABLE_FIELDS.map((field) => field.key);

/**
 * SELECT … FROM for investors as seen by one company: shared fields, that
 * company's own rating, its own email outreach, and the team score across all companies.
 * `companyParam` is the placeholder holding the company id, e.g. "$1".
 * Score: High = 3, Medium = 2, Low = 1; custom values don't count.
 */
export function investorSelect(companyParam: string, extraColumns = ""): string {
  return `
    SELECT i.id, ${SHARED_COLUMNS.map((column) => `i.${column}`).join(", ")},
           i.field_sources, i.source_company_id, i.uploaded_at,
           mine.quality,
           team.score::float AS team_score,
           coalesce(team.votes, 0)::int AS team_votes,
           coalesce(team.ratings, '[]'::json) AS team_ratings,
           coalesce(outreach.mails_sent, 0)::int AS mails_sent,
           outreach.last_mailed_at,
           outreach.last_mailed_by,
           coalesce(outreach.has_replied, false) AS has_replied
           ${extraColumns}
    FROM investors i
    LEFT JOIN investor_company_data mine
      ON mine.investor_id = i.id AND mine.company_id = ${companyParam}
    LEFT JOIN LATERAL (
      SELECT round(avg(CASE lower(r.quality) WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END), 2) AS score,
             count(*) FILTER (WHERE lower(r.quality) IN ('high', 'medium', 'low')) AS votes,
             json_agg(json_build_object('company_id', r.company_id, 'quality', r.quality) ORDER BY r.company_id) AS ratings
      FROM investor_company_data r
      WHERE r.investor_id = i.id AND r.quality IS NOT NULL
    ) team ON true
    LEFT JOIN LATERAL (
      -- Only this company's own mail: other companies never see who emailed whom.
      SELECT count(*) FILTER (WHERE e.direction = 'outbound' AND e.status = 'sent') AS mails_sent,
             max(e.occurred_at) FILTER (WHERE e.direction = 'outbound' AND e.status = 'sent') AS last_mailed_at,
             (array_agg(coalesce(nullif(e.sent_by, 'Mailbox'), e.from_name, e.sent_by) ORDER BY e.occurred_at DESC)
               FILTER (WHERE e.direction = 'outbound' AND e.status = 'sent'))[1] AS last_mailed_by,
             bool_or(e.direction = 'inbound' AND e.inbound_kind IS NULL) AS has_replied
      FROM emails e
      WHERE e.investor_id = i.id AND e.company_id = ${companyParam}
    ) outreach ON true`;
}

/** SQL condition on the team score for the teamScore filter; null if the value is unknown. */
export function teamScoreCondition(value: string): string | null {
  switch (value) {
    case "high":
      return "team.score >= 2.5";
    case "medium":
      return "team.score >= 1.5 AND team.score < 2.5";
    case "low":
      return "team.score < 1.5";
    case "unrated":
      return "team.score IS NULL";
    default:
      return null;
  }
}

/** SQL condition for the "emailed by us" filter; null if the value is unknown. */
export function outreachCondition(value: string, companyParam: string): string | null {
  const sent = `SELECT 1 FROM emails e WHERE e.investor_id = i.id AND e.company_id = ${companyParam}
                AND e.direction = 'outbound' AND e.status = 'sent'`;
  switch (value) {
    case "yes":
      return `EXISTS (${sent})`;
    case "no":
      return `NOT EXISTS (${sent})`;
    case "replied":
      return `EXISTS (SELECT 1 FROM emails e WHERE e.investor_id = i.id AND e.company_id = ${companyParam} AND e.direction = 'inbound' AND e.inbound_kind IS NULL)`;
    default:
      return null;
  }
}

/** Loads investors by id as seen by the given company (e.g. after an update). */
export async function loadInvestors(db: Queryable, ids: (number | string)[], companyId: string): Promise<Investor[]> {
  if (ids.length === 0) return [];
  const result = await db.query<Investor>(
    `${investorSelect("$1")} WHERE i.id = ANY($2::bigint[]) ORDER BY i.id`,
    [companyId, ids]
  );
  return result.rows;
}
