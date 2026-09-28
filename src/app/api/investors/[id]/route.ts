import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { FILTER_OPTIONS_CACHE_KEY, invalidateCache } from "../../../../lib/cache";
import {
  INVESTOR_COLUMNS,
  buildUpdateSet,
  parseInvestorChanges,
} from "../../../../lib/investorChanges";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = Number(rawId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid investor id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseInvestorChanges(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { setClause, values } = buildUpdateSet(parsed.changes);
    values.push(String(id));

    const result = await pool.query(
      `UPDATE investors SET ${setClause} WHERE id = $${values.length} RETURNING ${INVESTOR_COLUMNS}`,
      values
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }

    invalidateCache(FILTER_OPTIONS_CACHE_KEY);

    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error("Investor update API error:", error);
    return NextResponse.json({ error: "Failed to update investor" }, { status: 500 });
  }
}
