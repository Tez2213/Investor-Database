import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../../../lib/db";
import { auditLater } from "../../../../../../lib/audit";
import { requireAdmin } from "../../../../../../lib/auth/adminSession";
import { forgetCachedSessions } from "../../../../../../lib/auth/session";
import { withTransaction } from "../../../../../../lib/activity";
import { buildAssignmentCriteria, type AssignmentCriteria } from "../../../../../../lib/assignmentCriteria";
import { loadAssignmentTarget, paramBuilder } from "../../../../../../lib/assignments";
import { parseInvestorCode } from "../../../../../../lib/format";
import { parseId } from "../../../../../../lib/parseId";

const PAGE_SIZE = 50;
const MAX_REMOVE_IDS = 20_000;

type Params = { params: Promise<{ id: string }> };

async function targetFrom(params: Params["params"]) {
  const id = parseId((await params).id);
  if (id === null) return { error: NextResponse.json({ error: "Invalid user id" }, { status: 400 }) };
  const target = await loadAssignmentTarget(pool, id);
  if (!target) return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  return { target };
}

/**
 * The investors assigned to one person (paged, searchable), plus the batches
 * they came from and totals.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const found = await targetFrom(params);
  if ("error" in found) return found.error;
  const { target } = found;

  const query = request.nextUrl.searchParams;
  const { values, param } = paramBuilder([target.id]);
  const conditions = ["a.user_id = $1"];

  const search = query.get("search")?.trim();
  if (search) {
    const searchId = parseInvestorCode(search);
    const like = param(`%${search}%`);
    conditions.push(`(${searchId !== null ? `i.id = ${param(searchId)} OR ` : ""}i.first_name ILIKE ${like}
      OR i.last_name ILIKE ${like} OR i.company_name ILIKE ${like} OR i.email ILIKE ${like})`);
  }
  const batchId = parseId(query.get("batchId"));
  if (batchId) conditions.push(`a.batch_id = ${param(batchId)}`);
  const cursor = parseId(query.get("cursor"));
  if (cursor) conditions.push(`a.investor_id > ${param(cursor)}`);

  try {
    const [rows, batches, totals] = await Promise.all([
      pool.query(
        `SELECT i.id, i.first_name, i.last_name, i.title, i.company_name, i.country, i.email,
                a.assigned_at, a.assigned_by, b.description AS batch_description
         FROM user_investor_assignments a
         JOIN investors i ON i.id = a.investor_id
         LEFT JOIN assignment_batches b ON b.id = a.batch_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY a.investor_id
         LIMIT ${param(PAGE_SIZE + 1)}`,
        values
      ),
      pool.query(
        `SELECT b.id, b.description, b.added_count, b.created_by, b.created_at,
                (SELECT count(*)::int FROM user_investor_assignments a WHERE a.batch_id = b.id) AS current_count
         FROM assignment_batches b WHERE b.user_id = $1
         ORDER BY b.created_at DESC LIMIT 100`,
        [target.id]
      ),
      pool.query<{ total: number; min_id: string | null; max_id: string | null }>(
        `SELECT count(*)::int AS total, min(investor_id) AS min_id, max(investor_id) AS max_id
         FROM user_investor_assignments WHERE user_id = $1`,
        [target.id]
      ),
    ]);

    const page = rows.rows.slice(0, PAGE_SIZE);
    return NextResponse.json({
      user: target,
      total: totals.rows[0].total,
      minId: totals.rows[0].min_id,
      maxId: totals.rows[0].max_id,
      batches: batches.rows,
      data: page,
      nextCursor: rows.rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Assignments list API error:", error);
    return NextResponse.json({ error: "Failed to load assignments" }, { status: 500 });
  }
}

/**
 * Previews or applies an assignment. Body: { criteria, preview?: boolean, limitAccess?: boolean }.
 * Preview reports how many investors match, how many this person already has,
 * and how many a teammate already has, without changing anything.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const found = await targetFrom(params);
  if ("error" in found) return found.error;
  const { target } = found;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.criteria !== "object" || body.criteria === null) {
    return NextResponse.json({ error: "Send the investors to assign" }, { status: 400 });
  }

  const { values, param } = paramBuilder([target.id, target.company_id]);
  const built = buildAssignmentCriteria(body.criteria as AssignmentCriteria, {
    param,
    userParam: "$1",
    companyParam: "$2",
  });
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  // The CROSS JOIN gives $1/$2 explicit types even when no condition uses them
  // (Postgres refuses parameters whose type it can't work out).
  const matchedSql = `SELECT i.id FROM investors i
    CROSS JOIN (SELECT $1::bigint AS target_user_id, $2::text AS target_company_id) target
    WHERE ${built.conditions.join(" AND ")} ORDER BY i.id${built.limit ? ` LIMIT ${param(built.limit)}` : ""}`;

  try {
    if (body.preview) {
      const [summary, sample] = await Promise.all([
        pool.query<{ matched: number; already: number; teammates: number; min_id: string | null; max_id: string | null }>(
          `WITH matched AS (${matchedSql})
           SELECT count(*)::int AS matched,
                  count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM user_investor_assignments a WHERE a.user_id = $1 AND a.investor_id = m.id))::int AS already,
                  count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM user_investor_assignments a JOIN auth_users u ON u.id = a.user_id
                    WHERE a.investor_id = m.id AND a.user_id <> $1 AND u.company_id = $2))::int AS teammates,
                  min(m.id) AS min_id, max(m.id) AS max_id
           FROM matched m`,
          values
        ),
        pool.query(
          `WITH matched AS (${matchedSql})
           SELECT i.id, i.first_name, i.last_name, i.company_name, i.country
           FROM matched m JOIN investors i ON i.id = m.id ORDER BY i.id LIMIT 5`,
          values
        ),
      ]);
      const row = summary.rows[0];
      return NextResponse.json({
        description: built.description,
        matched: row.matched,
        alreadyAssigned: row.already,
        toAdd: row.matched - row.already,
        assignedToTeammates: row.teammates,
        notFound: built.requestedIds > 0 ? Math.max(0, built.requestedIds - row.matched) : 0,
        minId: row.min_id,
        maxId: row.max_id,
        sample: sample.rows,
      });
    }

    const actor = admin.name || admin.email;
    const result = await withTransaction(pool, async (client) => {
      const batch = await client.query<{ id: string }>(
        `INSERT INTO assignment_batches (user_id, description, criteria, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [target.id, built.description, JSON.stringify(body.criteria), actor]
      );
      const batchId = batch.rows[0].id;
      const inserted = await client.query(
        `INSERT INTO user_investor_assignments (user_id, investor_id, batch_id, assigned_by)
         SELECT $1, m.id, ${param(batchId)}, ${param(actor)} FROM (${matchedSql}) m
         ON CONFLICT (user_id, investor_id) DO NOTHING`,
        values
      );
      const added = inserted.rowCount ?? 0;
      if (added === 0) {
        await client.query("DELETE FROM assignment_batches WHERE id = $1", [batchId]);
      } else {
        await client.query("UPDATE assignment_batches SET added_count = $2 WHERE id = $1", [batchId, added]);
      }

      let accessMode = target.access_mode;
      if (body.limitAccess === true && target.access_mode !== "assigned") {
        await client.query("UPDATE auth_users SET access_mode = 'assigned' WHERE id = $1", [target.id]);
        accessMode = "assigned";
      }
      return { added, batchId: added > 0 ? batchId : null, accessMode };
    });

    if (result.accessMode !== target.access_mode) forgetCachedSessions({ userId: target.id });
    auditLater(request, admin, {
      action: "assignments_added",
      companyId: target.company_id,
      details: { userId: target.id, email: target.email, added: result.added, description: built.description },
    });
    return NextResponse.json({ ...result, description: built.description });
  } catch (error) {
    console.error("Assign API error:", error);
    return NextResponse.json({ error: "Failed to assign investors" }, { status: 500 });
  }
}

/**
 * Removes assignments. Body: { investorIds: [...] } | { batchId } | { all: true }.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const found = await targetFrom(params);
  if ("error" in found) return found.error;
  const { target } = found;

  const body = await request.json().catch(() => null);
  try {
    let removed = 0;
    let description = "";
    if (body?.all === true) {
      const result = await withTransaction(pool, async (client) => {
        const deleted = await client.query("DELETE FROM user_investor_assignments WHERE user_id = $1", [target.id]);
        await client.query("DELETE FROM assignment_batches WHERE user_id = $1", [target.id]);
        return deleted.rowCount ?? 0;
      });
      removed = result;
      description = "all assignments";
    } else if (body?.batchId != null) {
      const batchId = parseId(body.batchId);
      if (!batchId) return NextResponse.json({ error: "Invalid batch" }, { status: 400 });
      const result = await withTransaction(pool, async (client) => {
        const batch = await client.query<{ description: string }>(
          "SELECT description FROM assignment_batches WHERE id = $1 AND user_id = $2 FOR UPDATE",
          [batchId, target.id]
        );
        if (batch.rowCount === 0) return null;
        // Remove the investors this batch assigned before the batch itself.
        const deleted = await client.query(
          "DELETE FROM user_investor_assignments WHERE user_id = $1 AND batch_id = $2",
          [target.id, batchId]
        );
        await client.query("DELETE FROM assignment_batches WHERE id = $1", [batchId]);
        return { description: batch.rows[0].description, removed: deleted.rowCount ?? 0 };
      });
      if (result === null) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
      description = result.description;
      removed = result.removed;
    } else if (Array.isArray(body?.investorIds) && body.investorIds.length > 0) {
      if (body.investorIds.length > MAX_REMOVE_IDS) {
        return NextResponse.json({ error: `Remove at most ${MAX_REMOVE_IDS.toLocaleString()} at a time` }, { status: 400 });
      }
      const ids = body.investorIds.map((value: unknown) => parseId(value)).filter((id: number | null): id is number => id !== null);
      const deleted = await pool.query(
        "DELETE FROM user_investor_assignments WHERE user_id = $1 AND investor_id = ANY($2::bigint[])",
        [target.id, ids]
      );
      removed = deleted.rowCount ?? 0;
      description = `${removed} chosen investors`;
    } else {
      return NextResponse.json({ error: "Say which assignments to remove" }, { status: 400 });
    }

    auditLater(request, admin, {
      action: "assignments_removed",
      companyId: target.company_id,
      details: { userId: target.id, email: target.email, removed, description },
    });
    return NextResponse.json({ removed });
  } catch (error) {
    console.error("Unassign API error:", error);
    return NextResponse.json({ error: "Failed to remove assignments" }, { status: 500 });
  }
}
