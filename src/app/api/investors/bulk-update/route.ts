import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { FILTER_OPTIONS_CACHE_KEY, invalidateCache } from "../../../../lib/cache";
import {
  INVESTOR_COLUMNS,
  buildUpdateSet,
  parseInvestorChanges,
} from "../../../../lib/investorChanges";

const MAX_BULK_IDS = 5000;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ids, changes } = (body ?? {}) as { ids?: unknown; changes?: unknown };

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK_IDS) {
    return NextResponse.json(
      { error: `Provide between 1 and ${MAX_BULK_IDS} investor ids` },
      { status: 400 }
    );
  }

  const numericIds = ids.map(Number);
  if (numericIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "Invalid investor id" }, { status: 400 });
  }

  const parsed = parseInvestorChanges(changes);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { setClause, values } = buildUpdateSet(parsed.changes);
    const idsParam = values.length + 1;

    const result = await pool.query(
      `UPDATE investors SET ${setClause} WHERE id = ANY($${idsParam}::bigint[]) RETURNING ${INVESTOR_COLUMNS}`,
      [...values, numericIds]
    );

    invalidateCache(FILTER_OPTIONS_CACHE_KEY);

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error("Investor bulk update API error:", error);
    return NextResponse.json({ error: "Failed to update investors" }, { status: 500 });
  }
}
