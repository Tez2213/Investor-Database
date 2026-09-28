import type { PoolClient } from "pg";
import { logActivities, withTransaction, type NewActivity } from "./activity";

export type CompanyDataChanges = {
  quality?: string | null;
  notes?: string | null;
  tags?: string[];
};

const MAX_NOTES_LENGTH = 10_000;
const MAX_QUALITY_LENGTH = 50;
const MAX_TAGS = 30;
const MAX_TAG_LENGTH = 40;

/** Validates { quality?, notes?, tags? } from a request body. */
export function parseCompanyDataChanges(body: unknown): CompanyDataChanges | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid body" };
  const input = body as Record<string, unknown>;
  const changes: CompanyDataChanges = {};

  for (const key of Object.keys(input)) {
    if (!["quality", "notes", "tags"].includes(key)) return { error: `Field "${key}" cannot be changed here` };
  }

  if ("quality" in input) {
    if (input.quality !== null && typeof input.quality !== "string") return { error: "Quality must be text" };
    const quality = input.quality?.trim() || null;
    if (quality && quality.length > MAX_QUALITY_LENGTH) return { error: "Quality is too long" };
    changes.quality = quality;
  }

  if ("notes" in input) {
    if (input.notes !== null && typeof input.notes !== "string") return { error: "Notes must be text" };
    const notes = input.notes?.trim() || null;
    if (notes && notes.length > MAX_NOTES_LENGTH) return { error: "Notes are too long" };
    changes.notes = notes;
  }

  if ("tags" in input) {
    if (!Array.isArray(input.tags)) return { error: "Tags must be a list" };
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const item of input.tags) {
      if (typeof item !== "string") return { error: "Each tag must be text" };
      const tag = item.replace(/\s+/g, " ").trim();
      if (!tag) continue;
      if (tag.length > MAX_TAG_LENGTH) return { error: `Tags can be at most ${MAX_TAG_LENGTH} characters` };
      if (seen.has(tag.toLowerCase())) continue;
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
    if (tags.length > MAX_TAGS) return { error: `At most ${MAX_TAGS} tags per investor` };
    changes.tags = tags;
  }

  if (Object.keys(changes).length === 0) return { error: "Nothing to update" };
  return changes;
}

/**
 * Saves one company's quality / notes / tags for the given investors (creating
 * the row when needed) and adds timeline entries for what actually changed.
 * Returns the ids that exist.
 */
export async function updateCompanyData(
  pool: { connect(): Promise<PoolClient> },
  params: { companyId: string; ids: number[]; actor: string; changes: CompanyDataChanges }
): Promise<{ ids: string[]; changedCount: number }> {
  const { companyId, ids, actor, changes } = params;
  const hasQuality = "quality" in changes;
  const hasNotes = "notes" in changes;
  const hasTags = "tags" in changes;

  return withTransaction(pool, async (client) => {
    // One round trip: which investors exist, plus this company's current values.
    // Locking the investor row serialises concurrent edits from the same company.
    const before = await client.query<{
      id: string;
      has_row: boolean;
      quality: string | null;
      notes: string | null;
      tags: string[] | null;
    }>(
      `SELECT i.id, d.investor_id IS NOT NULL AS has_row, d.quality, d.notes, d.tags
       FROM investors i
       LEFT JOIN investor_company_data d ON d.investor_id = i.id AND d.company_id = $1
       WHERE i.id = ANY($2::bigint[])
       FOR UPDATE OF i`,
      [companyId, ids]
    );
    const validIds = before.rows.map((row) => row.id);
    if (validIds.length === 0) return { ids: [], changedCount: 0 };
    const previous = new Map(
      before.rows.filter((row) => row.has_row).map((row) => [row.id, { ...row, tags: row.tags ?? [] }])
    );

    await client.query(
      `INSERT INTO investor_company_data (investor_id, company_id, quality, notes, tags, updated_at, updated_by)
       SELECT id, $1,
              CASE WHEN $3::boolean THEN $4::text END,
              CASE WHEN $5::boolean THEN $6::text END,
              CASE WHEN $7::boolean THEN $8::text[] ELSE '{}'::text[] END,
              now(), $9
       FROM unnest($2::bigint[]) AS id
       ON CONFLICT (investor_id, company_id) DO UPDATE SET
         quality = CASE WHEN $3::boolean THEN EXCLUDED.quality ELSE investor_company_data.quality END,
         notes = CASE WHEN $5::boolean THEN EXCLUDED.notes ELSE investor_company_data.notes END,
         tags = CASE WHEN $7::boolean THEN EXCLUDED.tags ELSE investor_company_data.tags END,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by`,
      [
        companyId,
        validIds,
        hasQuality,
        changes.quality ?? null,
        hasNotes,
        changes.notes ?? null,
        hasTags,
        changes.tags ?? [],
        actor,
      ]
    );

    const bulk = validIds.length > 1;
    const activities: NewActivity[] = [];
    for (const id of validIds) {
      const old = previous.get(id);
      if (hasQuality && (old?.quality ?? null) !== (changes.quality ?? null)) {
        activities.push({
          investorId: id,
          companyId,
          kind: "field_change",
          actor,
          details: { changes: [{ field: "quality", from: old?.quality ?? null, to: changes.quality ?? null }], ...(bulk ? { bulk } : {}) },
        });
      }
      if (hasNotes && (old?.notes ?? null) !== (changes.notes ?? null)) {
        activities.push({ investorId: id, companyId, kind: "notes_updated", actor, body: changes.notes ?? null });
      }
      if (hasTags) {
        const oldTags = old?.tags ?? [];
        const oldKeys = new Set(oldTags.map((tag) => tag.toLowerCase()));
        const newTags = changes.tags ?? [];
        const newKeys = new Set(newTags.map((tag) => tag.toLowerCase()));
        const added = newTags.filter((tag) => !oldKeys.has(tag.toLowerCase()));
        const removed = oldTags.filter((tag) => !newKeys.has(tag.toLowerCase()));
        if (added.length > 0 || removed.length > 0) {
          activities.push({ investorId: id, companyId, kind: "tags_updated", actor, details: { added, removed } });
        }
      }
    }
    await logActivities(client, activities);

    return { ids: validIds, changedCount: activities.length };
  });
}
