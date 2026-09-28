import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { auditLater } from "../../../../../lib/audit";
import { actorName, requireSession } from "../../../../../lib/auth/session";
import { NOT_ASSIGNED_ERROR, canAccessInvestor } from "../../../../../lib/access";
import { logActivities } from "../../../../../lib/activity";
import { emailSummaryJson } from "../../../../../lib/emailColumns";
import { parseId } from "../../../../../lib/parseId";
import type { ActivitiesResponse, Activity } from "../../../../../lib/types";

const PAGE_SIZE = 50;
const MAX_COMMENT_LENGTH = 5000;

/**
 * This company's timeline for an investor, newest first.
 * Cursor is "<created_at ISO>|<id>" of the last entry seen.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid investor id" }, { status: 400 });
  }
  if (!(await canAccessInvestor(pool, session, id))) {
    return NextResponse.json({ error: NOT_ASSIGNED_ERROR, code: "not_assigned" }, { status: 403 });
  }

  const cursor = request.nextUrl.searchParams.get("cursor");
  const values: unknown[] = [session.companyId, id];
  let cursorCondition = "";
  if (cursor) {
    const [createdAt, cursorId] = cursor.split("|");
    if (!createdAt || Number.isNaN(Date.parse(createdAt)) || parseId(cursorId) === null) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    values.push(createdAt, cursorId);
    cursorCondition = `AND (a.created_at, a.id) < ($3::timestamptz, $4::bigint)`;
  }
  values.push(PAGE_SIZE + 1);

  try {
    const result = await pool.query<Activity>(
      `SELECT a.id, a.investor_id, a.kind, a.actor, a.body, a.details, a.email_id, a.created_at,
              CASE WHEN e.id IS NULL THEN NULL ELSE ${emailSummaryJson("e")} END AS email
       FROM investor_activities a
       LEFT JOIN emails e ON e.id = a.email_id
       WHERE a.company_id = $1 AND a.investor_id = $2 ${cursorCondition}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${values.length}`,
      values
    );

    const rows = result.rows.slice(0, PAGE_SIZE);
    const last = rows[rows.length - 1];
    const response: ActivitiesResponse = {
      data: rows,
      nextCursor:
        result.rows.length > PAGE_SIZE && last ? `${new Date(last.created_at).toISOString()}|${last.id}` : null,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Activities API error:", error);
    return NextResponse.json({ error: "Failed to load timeline" }, { status: 500 });
  }
}

/** Adds a comment to this company's timeline for the investor. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid investor id" }, { status: 400 });
  }
  if (!(await canAccessInvestor(pool, session, id))) {
    return NextResponse.json({ error: NOT_ASSIGNED_ERROR, code: "not_assigned" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
  }
  if (text.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }

  try {
    const exists = await pool.query("SELECT 1 FROM investors WHERE id = $1", [id]);
    if (exists.rowCount === 0) {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }
    await logActivities(pool, [
      { investorId: id, companyId: session.companyId, kind: "comment", actor: actorName(session), body: text },
    ]);
    auditLater(request, session, { action: "comment_added", investorId: id, details: { length: text.length } });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Add comment API error:", error);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
