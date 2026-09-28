import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { sharedFilterOptions } from "../../../../lib/filterOptions";
import { QUALITY_OPTIONS, type FilterOptions } from "../../../../lib/types";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  try {
    const [shared, qualities] = await Promise.all([
      sharedFilterOptions(),
      // Quality values are this company's own ratings (small table, not cached).
      pool.query<{ quality: string }>(
        `SELECT DISTINCT quality FROM investor_company_data
         WHERE company_id = $1 AND quality IS NOT NULL AND quality <> ''
         ORDER BY quality ASC LIMIT 100`,
        [session.companyId]
      ),
    ]);

    const options: FilterOptions = {
      ...shared,
      qualities: Array.from(new Set<string>([...QUALITY_OPTIONS, ...qualities.rows.map((row) => row.quality)])),
    };
    return NextResponse.json(options);
  } catch (error) {
    console.error("Investor filters API error:", error);
    return NextResponse.json({ error: "Failed to fetch filter options" }, { status: 500 });
  }
}
