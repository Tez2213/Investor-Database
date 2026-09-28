import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { FILTER_OPTIONS_CACHE_KEY, getOrSetCache } from "../../../../lib/cache";
import { QUALITY_OPTIONS, type FilterOptions } from "../../../../lib/types";

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Countries and industries are shared by everyone, so they're cached. */
async function loadSharedOptions(): Promise<Pick<FilterOptions, "countries" | "industries">> {
  const [countries, industries] = await Promise.all([
    pool.query<{ country: string }>(
      `SELECT DISTINCT country FROM investors
       WHERE country IS NOT NULL AND country <> ''
       ORDER BY country ASC
       LIMIT 500`
    ),
    pool.query<{ industry: string }>(
      `SELECT DISTINCT industry FROM investors
       WHERE industry IS NOT NULL AND industry <> ''
       ORDER BY industry ASC
       LIMIT 2000`
    ),
  ]);

  return {
    countries: countries.rows.map((row) => row.country),
    industries: industries.rows.map((row) => row.industry),
  };
}

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  try {
    const [shared, qualities] = await Promise.all([
      getOrSetCache(FILTER_OPTIONS_CACHE_KEY, CACHE_TTL_MS, loadSharedOptions),
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
