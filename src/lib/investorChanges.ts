import { EDITABLE_FIELDS, type EditableInvestorField } from "./types";

const MAX_FIELD_LENGTH = 1000;
const EDITABLE_KEYS = new Set<string>(EDITABLE_FIELDS.map((field) => field.key));

export const INVESTOR_COLUMNS = [
  "id",
  ...EDITABLE_FIELDS.map((field) => field.key),
  "field_sources",
].join(", ");

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

    changes.push([key as EditableInvestorField, trimmed || null]);
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
