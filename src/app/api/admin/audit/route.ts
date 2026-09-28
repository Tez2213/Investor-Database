import { NextRequest, NextResponse } from "next/server";
import type { AuditRow } from "../../../../lib/adminTypes";
import { pool } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/auth/adminSession";
import { isCompanyId } from "../../../../lib/companies";
import { parseId } from "../../../../lib/parseId";

const PAGE_SIZE = 100;

/** Everything that happened across all companies, newest first, with filters. */
export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session instanceof NextResponse) return session;

  const params = request.nextUrl.searchParams;
  const values: unknown[] = [];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const conditions: string[] = [];

  const company = params.get("company");
  if (company && isCompanyId(company)) conditions.push(`a.company_id = ${param(company)}`);

  const userId = parseId(params.get("userId"));
  if (userId) conditions.push(`a.user_id = ${param(userId)}`);

  const action = params.get("action")?.trim();
  if (action) conditions.push(`a.action = ${param(action)}`);

  const investorId = parseId(params.get("investorId"));
  if (investorId) conditions.push(`a.investor_id = ${param(investorId)}`);

  const search = params.get("search")?.trim();
  if (search) {
    const like = param(`%${search}%`);
    conditions.push(`(a.user_email ILIKE ${like} OR a.action ILIKE ${like} OR a.details::text ILIKE ${like})`);
  }

  const since = params.get("since");
  if (since && !Number.isNaN(Date.parse(since))) conditions.push(`a.created_at >= ${param(since)}::timestamptz`);

  const cursor = params.get("cursor");
  if (cursor) {
    const [createdAt, cursorId] = cursor.split("|");
    if (!createdAt || Number.isNaN(Date.parse(createdAt)) || parseId(cursorId) === null) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    conditions.push(`(a.created_at, a.id) < (${param(createdAt)}::timestamptz, ${param(cursorId)}::bigint)`);
  }

  try {
    const result = await pool.query<AuditRow>(
      `SELECT a.id, a.created_at, a.user_id, a.user_email, u.name AS user_name, a.company_id, a.action,
              a.investor_id, nullif(trim(concat_ws(' ', i.first_name, i.last_name)), '') AS investor_name,
              a.details, a.ip, a.user_agent
       FROM audit_log a
       LEFT JOIN auth_users u ON u.id = a.user_id
       LEFT JOIN investors i ON i.id = a.investor_id
       ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ${param(PAGE_SIZE + 1)}`,
      values
    );
    const rows = result.rows.slice(0, PAGE_SIZE);
    const last = rows[rows.length - 1];
    return NextResponse.json({
      data: rows,
      nextCursor: result.rows.length > PAGE_SIZE && last ? `${new Date(last.created_at).toISOString()}|${last.id}` : null,
    });
  } catch (error) {
    console.error("Audit API error:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
