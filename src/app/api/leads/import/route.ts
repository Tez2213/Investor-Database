import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { auditLater } from "../../../../lib/audit";
import { actorName, requireSession } from "../../../../lib/auth/session";
import { withTransaction } from "../../../../lib/activity";
import { FILTER_OPTIONS_CACHE_KEY, TOTAL_COUNT_CACHE_KEY, invalidateCache } from "../../../../lib/cache";
import { parseId } from "../../../../lib/parseId";
import { EDITABLE_FIELDS, type EditableInvestorField, type LeadImportSummary } from "../../../../lib/types";

const MAX_ROWS_PER_REQUEST = 500;
const MAX_FIELD_LENGTH = 1000;
const FIELD_KEYS = EDITABLE_FIELDS.map((field) => field.key);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LeadRow = Partial<Record<EditableInvestorField, string | null>> & { quality?: string | null };

function cleanRow(input: unknown): LeadRow | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const row: LeadRow = {};
  for (const key of [...FIELD_KEYS, "quality" as const]) {
    const value = source[key];
    if (value == null) continue;
    if (typeof value !== "string" && typeof value !== "number") return null;
    const text = String(value).replace(/\s+/g, " ").trim();
    if (!text) continue;
    row[key] = text.slice(0, MAX_FIELD_LENGTH);
  }
  if (row.email) {
    row.email = row.email.toLowerCase();
    if (!EMAIL_PATTERN.test(row.email)) delete row.email;
  }
  if (row.quality) row.quality = row.quality.slice(0, 50);
  // A lead needs at least a name, a company or an email to be useful.
  if (!row.first_name && !row.last_name && !row.company_name && !row.email) return null;
  return row;
}

/** Import history for this company (admins see every company's). */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const all = session.role === "admin" && request.nextUrl.searchParams.get("scope") === "all";
  const result = await pool.query(
    `SELECT id, company_id, user_email, file_name, total_rows, inserted, duplicates, invalid, created_at
     FROM lead_imports ${all ? "" : "WHERE company_id = $1"}
     ORDER BY created_at DESC LIMIT 50`,
    all ? [] : [session.companyId]
  );
  return NextResponse.json({ data: result.rows });
}

/**
 * Adds uploaded leads to the shared list, watermarked with the uploading company.
 * Send rows in chunks: the first call (no importId) starts an import; pass the
 * returned importId with later chunks so they are grouped together.
 */
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Send a list of rows" }, { status: 400 });
  }
  if (body.rows.length === 0 || body.rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_ROWS_PER_REQUEST} rows per request` }, { status: 400 });
  }
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : null;
  const totalRows = Number.isSafeInteger(body.totalRows) ? Number(body.totalRows) : body.rows.length;
  const existingImportId = body.importId == null ? null : parseId(body.importId);

  const rows: LeadRow[] = [];
  let invalid = 0;
  for (const input of body.rows) {
    const row = cleanRow(input);
    if (row) rows.push(row);
    else invalid += 1;
  }

  try {
    const summary = await withTransaction(pool, async (client) => {
      let importId = existingImportId ? String(existingImportId) : null;
      if (importId) {
        const owned = await client.query("SELECT 1 FROM lead_imports WHERE id = $1 AND company_id = $2 FOR UPDATE", [
          importId,
          session.companyId,
        ]);
        if (owned.rowCount === 0) throw Object.assign(new Error("Import not found"), { status: 404 });
      } else {
        const created = await client.query<{ id: string }>(
          `INSERT INTO lead_imports (company_id, user_id, user_email, file_name, total_rows)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [session.companyId, session.userId, session.email, fileName, totalRows]
        );
        importId = created.rows[0].id;
      }

      // Skip leads already in the database (or repeated in this chunk) by email or LinkedIn.
      const emails = rows.map((row) => row.email).filter((email): email is string => Boolean(email));
      const linkedins = rows.map((row) => row.linkedin?.toLowerCase()).filter((url): url is string => Boolean(url));
      const existing = await client.query<{ email: string | null; linkedin: string | null }>(
        `SELECT lower(email) AS email, lower(linkedin) AS linkedin FROM investors
         WHERE lower(email) = ANY($1::text[]) OR lower(linkedin) = ANY($2::text[])`,
        [emails, linkedins]
      );
      const seenEmails = new Set(existing.rows.map((row) => row.email).filter(Boolean));
      const seenLinkedins = new Set(existing.rows.map((row) => row.linkedin).filter(Boolean));

      const fresh: LeadRow[] = [];
      let duplicates = 0;
      for (const row of rows) {
        const linkedin = row.linkedin?.toLowerCase();
        if ((row.email && seenEmails.has(row.email)) || (linkedin && seenLinkedins.has(linkedin))) {
          duplicates += 1;
          continue;
        }
        if (row.email) seenEmails.add(row.email);
        if (linkedin) seenLinkedins.add(linkedin);
        fresh.push(row);
      }

      let insertedIds: { id: string; quality: string | null }[] = [];
      if (fresh.length > 0) {
        // Reserve ids up front so each row's rating is linked to exactly the right lead.
        const reserved = await client.query<{ id: string }>(
          "SELECT nextval(pg_get_serial_sequence('investors', 'id'))::text AS id FROM generate_series(1, $1)",
          [fresh.length]
        );
        const withIds = fresh.map((row, index) => ({ ...row, id: reserved.rows[index].id }));

        const columns = FIELD_KEYS.join(", ");
        const recordType = ["id bigint", ...FIELD_KEYS.map((key) => `${key} text`)].join(", ");
        await client.query(
          `INSERT INTO investors (id, ${columns}, source_company_id, uploaded_by, uploaded_at, import_id)
           SELECT id, ${columns}, $2, $3, now(), $4
           FROM jsonb_to_recordset($1::jsonb) AS x(${recordType})`,
          [JSON.stringify(withIds), session.companyId, session.userId, importId]
        );
        insertedIds = withIds.map((row) => ({ id: row.id, quality: row.quality ?? null }));

        const rated = insertedIds.filter((row) => row.quality);
        if (rated.length > 0) {
          await client.query(
            `INSERT INTO investor_company_data (investor_id, company_id, quality, updated_by)
             SELECT (x->>'id')::bigint, $2, x->>'quality', $3 FROM jsonb_array_elements($1::jsonb) AS x
             ON CONFLICT (investor_id, company_id) DO UPDATE SET quality = EXCLUDED.quality, updated_at = now()`,
            [JSON.stringify(rated), session.companyId, actorName(session)]
          );
        }
      }

      await client.query(
        `UPDATE lead_imports SET inserted = inserted + $2, duplicates = duplicates + $3, invalid = invalid + $4
         WHERE id = $1`,
        [importId, insertedIds.length, duplicates, invalid]
      );

      return { id: importId!, total: body.rows.length, inserted: insertedIds.length, duplicates, invalid };
    });

    invalidateCache(TOTAL_COUNT_CACHE_KEY);
    invalidateCache(FILTER_OPTIONS_CACHE_KEY);
    auditLater(request, session, {
      action: "leads_uploaded",
      details: { importId: summary.id, fileName, ...summary },
    });

    const response: LeadImportSummary = summary;
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return NextResponse.json({ error: "Import not found" }, { status: 404 });
    console.error("Lead import API error:", error);
    return NextResponse.json({ error: "Failed to upload leads" }, { status: 500 });
  }
}
