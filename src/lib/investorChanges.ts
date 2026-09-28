import type { PoolClient } from "pg";
import { logActivities, withTransaction, type NewActivity } from "./activity";
import { loadInvestors } from "./investorQuery";
import {
  EDITABLE_FIELDS,
  type EditableInvestorField,
  type FieldChange,
  type Investor,
} from "./types";

const MAX_FIELD_LENGTH = 1000;
const EDITABLE_KEYS = new Set<string>(EDITABLE_FIELDS.map((field) => field.key));

export type InvestorChange = [EditableInvestorField, string | null];

export function parseInvestorChanges(
  body: unknown
): { changes: InvestorChange[] } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Changes must be an object" };
  }

  const changes: InvestorChange[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_KEYS.has(key)) {
      return { error: `Field "${key}" is not editable` };
    }
    if (value !== null && typeof value !== "string") {
      return { error: `Field "${key}" must be a string` };
    }

    const trimmed = value?.trim() ?? "";
    if (trimmed.length > MAX_FIELD_LENGTH) {
      return { error: `Field "${key}" is too long` };
    }
    if (key === "email" && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { error: "Email address is not valid" };
    }

    changes.push([key as EditableInvestorField, key === "email" ? trimmed.toLowerCase() || null : trimmed || null]);
  }

  if (changes.length === 0) {
    return { error: "No fields to update" };
  }

  return { changes };
}

/**
 * Builds the SET clause for an UPDATE: the changed columns plus marking each of
 * them "edited" in field_sources. Column names come from the EDITABLE_FIELDS
 * whitelist, never from user input. Values start at placeholder $1.
 */
export function buildUpdateSet(changes: InvestorChange[]) {
  const assignments = changes.map(([key], index) => `${key} = $${index + 1}`);
  const editedMarks = Object.fromEntries(changes.map(([key]) => [key, "edited"]));
  const sourcesParam = changes.length + 1;
  assignments.push(`field_sources = field_sources || $${sourcesParam}::jsonb`);

  return {
    setClause: assignments.join(", "),
    values: [...changes.map(([, value]) => value), JSON.stringify(editedMarks)],
  };
}

/**
 * Applies shared-field changes to the given investors in one transaction and
 * records a "field_change" entry on the acting company's timeline for every
 * investor whose values actually changed. Returns rows as that company sees them.
 */
export async function applyInvestorChanges(
  pool: { connect(): Promise<PoolClient> },
  ids: number[],
  changes: InvestorChange[],
  context: { actor: string; companyId: string }
): Promise<{ rows: Investor[]; changedCount: number }> {
  const keys = changes.map(([key]) => key);

  return withTransaction(pool, async (client) => {
    const before = await client.query<Record<string, string | null> & { id: string }>(
      `SELECT id, ${keys.join(", ")} FROM investors WHERE id = ANY($1::bigint[]) FOR UPDATE`,
      [ids]
    );
    if (before.rowCount === 0) return { rows: [], changedCount: 0 };

    const { setClause, values } = buildUpdateSet(changes);
    await client.query(
      `UPDATE investors SET ${setClause} WHERE id = ANY($${values.length + 1}::bigint[])`,
      [...values, ids]
    );

    const activities: NewActivity[] = [];
    for (const row of before.rows) {
      const diffs: FieldChange[] = changes
        .filter(([key, value]) => (row[key] ?? null) !== value)
        .map(([key, value]) => ({ field: key, from: row[key] ?? null, to: value }));
      if (diffs.length > 0) {
        activities.push({
          investorId: row.id,
          companyId: context.companyId,
          kind: "field_change",
          actor: context.actor,
          details: { changes: diffs, ...(ids.length > 1 ? { bulk: true } : {}) },
        });
      }
    }
    await logActivities(client, activities);

    const rows = await loadInvestors(client, before.rows.map((row) => row.id), context.companyId);
    return { rows, changedCount: activities.length };
  });
}
