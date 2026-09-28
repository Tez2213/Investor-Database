import type { PoolClient } from "pg";
import type { ActivityDetails, ActivityKind } from "./types";

export type NewActivity = {
  investorId: number | string;
  /** Workspace the entry belongs to; other companies never see it. */
  companyId: string;
  kind: ActivityKind;
  actor: string | null;
  body?: string | null;
  details?: ActivityDetails;
  emailId?: number | string | null;
  /** Defaults to now; set for events that happened earlier (e.g. synced mail). */
  createdAt?: Date;
};

type Queryable = Pick<PoolClient, "query">;

/** Inserts timeline entries in one statement (handles thousands of rows for bulk edits). */
export async function logActivities(db: Queryable, activities: NewActivity[]) {
  if (activities.length === 0) return;
  const rows = activities.map((activity) => ({
    investor_id: String(activity.investorId),
    company_id: activity.companyId,
    kind: activity.kind,
    actor: activity.actor,
    body: activity.body ?? null,
    details: activity.details ?? {},
    email_id: activity.emailId == null ? null : String(activity.emailId),
    created_at: activity.createdAt ? activity.createdAt.toISOString() : null,
  }));
  await db.query(
    `INSERT INTO investor_activities (investor_id, company_id, kind, actor, body, details, email_id, created_at)
     SELECT investor_id, company_id, kind, actor, body, details, email_id, coalesce(created_at, now())
     FROM jsonb_to_recordset($1::jsonb)
       AS x(investor_id bigint, company_id text, kind text, actor text, body text, details jsonb, email_id bigint, created_at timestamptz)`,
    [JSON.stringify(rows)]
  );
}

/** Runs fn inside a transaction on a dedicated connection. */
export async function withTransaction<T>(
  pool: { connect(): Promise<PoolClient> },
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
