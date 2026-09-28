import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/auth/adminSession";
import { buildAssignmentCriteria } from "../../../../lib/assignmentCriteria";
import { loadAssignmentTarget, paramBuilder } from "../../../../lib/assignments";
import { parseInvestorCode } from "../../../../lib/format";
import { parseId } from "../../../../lib/parseId";

const PAGE_SIZE = 50;

/**
 * Investor search for hand-picking assignments. For the chosen person it marks
 * who already has each investor. Accepts the same filters as assigning
 * (country, industry, source, onlyUnassigned…) as query parameters.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const query = request.nextUrl.searchParams;
  const userId = parseId(query.get("userId"));
  if (userId === null) return NextResponse.json({ error: "Choose a person first" }, { status: 400 });
  const target = await loadAssignmentTarget(pool, userId);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { values, param } = paramBuilder([target.id, target.company_id]);
  const conditions: string[] = [];

  // A bare ID search ("INV-000123" / "123") jumps straight to that investor.
  const search = query.get("search")?.trim() ?? "";
  const searchId = search ? parseInvestorCode(search) : null;
  const criteria = {
    search: searchId !== null ? "" : search,
    ids: searchId !== null ? [searchId] : null,
    country: query.get("country"),
    industry: query.get("industry"),
    source: query.get("source"),
    hasEmail: (query.get("hasEmail") as "yes" | "no" | null) ?? null,
    hasLinkedIn: (query.get("hasLinkedIn") as "yes" | "no" | null) ?? null,
    onlyUnassigned: query.get("onlyUnassigned") === "1",
  };
  const built = buildAssignmentCriteria(criteria, { param, userParam: "$1", companyParam: "$2" });
  if ("error" in built) {
    // No filters at all is fine here: just list investors in ID order.
    if (!built.error.startsWith("Choose at least one")) return NextResponse.json({ error: built.error }, { status: 400 });
  } else {
    conditions.push(...built.conditions);
  }

  const cursor = parseId(query.get("cursor"));
  if (cursor) conditions.push(`i.id > ${param(cursor)}`);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT i.id, i.first_name, i.last_name, i.title, i.company_name, i.country, i.email,
              EXISTS (SELECT 1 FROM user_investor_assignments a WHERE a.user_id = $1 AND a.investor_id = i.id) AS assigned_to_user,
              (SELECT coalesce(json_agg(json_build_object('name', coalesce(u.name, u.email), 'company_id', u.company_id)), '[]'::json)
               FROM user_investor_assignments a JOIN auth_users u ON u.id = a.user_id
               WHERE a.investor_id = i.id AND a.user_id <> $1) AS other_assignees
       FROM investors i
       -- Gives $2 an explicit type even when no filter uses it.
       CROSS JOIN (SELECT $2::text AS target_company_id) target
       ${where}
       ORDER BY i.id
       LIMIT ${param(PAGE_SIZE + 1)}`,
      values
    );
    const page = result.rows.slice(0, PAGE_SIZE);
    return NextResponse.json({
      data: page,
      nextCursor: result.rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Admin investor search API error:", error);
    return NextResponse.json({ error: "Failed to search investors" }, { status: 500 });
  }
}
