import type { PoolClient } from "pg";
import type { Session } from "./auth/session";

/**
 * Investor assignments. A member whose access mode is "assigned" may only see,
 * edit and email the investors an admin assigned to them; everyone else (and
 * every admin) sees all investors. Every API that touches investors or email
 * goes through these helpers, so the rule is enforced on the server, not just
 * hidden in the UI.
 */

type Queryable = Pick<PoolClient, "query">;
type AccessSession = Pick<Session, "userId" | "role" | "accessMode">;

export const NOT_ASSIGNED_ERROR = "This investor isn't assigned to you. Ask your admin for access.";

export function isRestricted(session: AccessSession): boolean {
  return session.role !== "admin" && session.accessMode === "assigned";
}

/**
 * SQL condition limiting an investor id column to what this user may see, or
 * null when they may see everything. `param` adds a query parameter and
 * returns its placeholder.
 */
export function investorAccessCondition(
  session: AccessSession,
  idColumn: string,
  param: (value: string) => string
): string | null {
  if (!isRestricted(session)) return null;
  return `${idColumn} IN (SELECT investor_id FROM user_investor_assignments WHERE user_id = ${param(session.userId)})`;
}

/** The subset of ids this user may access (all of them when unrestricted). */
export async function accessibleInvestorIds(
  db: Queryable,
  session: AccessSession,
  ids: (string | number)[]
): Promise<Set<string>> {
  const unique = Array.from(new Set(ids.map(String)));
  if (!isRestricted(session) || unique.length === 0) return new Set(unique);
  const result = await db.query<{ investor_id: string }>(
    "SELECT investor_id FROM user_investor_assignments WHERE user_id = $1 AND investor_id = ANY($2::bigint[])",
    [session.userId, unique]
  );
  return new Set(result.rows.map((row) => String(row.investor_id)));
}

export async function canAccessInvestor(db: Queryable, session: AccessSession, id: string | number): Promise<boolean> {
  if (!isRestricted(session)) return true;
  return (await accessibleInvestorIds(db, session, [id])).has(String(id));
}

/** How many investors this user may see; null when unrestricted. */
export async function assignedCount(db: Queryable, session: AccessSession): Promise<number | null> {
  if (!isRestricted(session)) return null;
  const result = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM user_investor_assignments WHERE user_id = $1",
    [session.userId]
  );
  return result.rows[0]?.count ?? 0;
}
