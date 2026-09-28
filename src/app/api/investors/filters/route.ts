import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { FILTER_OPTIONS_CACHE_KEY, getOrSetCache } from "../../../../lib/cache";
import { QUALITY_OPTIONS, type FilterOptions } from "../../../../lib/types";

const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadFilterOptions(): Promise<FilterOptions> {
  const [countries, industries, qualities] = await Promise.all([
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
    pool.query<{ quality: string }>(
      `SELECT DISTINCT quality FROM investors
       WHERE quality IS NOT NULL AND quality <> ''
       ORDER BY quality ASC
       LIMIT 100`
    ),
  ]);

  return {
    countries: countries.rows.map((row) => row.country),
    industries: industries.rows.map((row) => row.industry),
    qualities: Array.from(
      new Set<string>([...QUALITY_OPTIONS, ...qualities.rows.map((row) => row.quality)])
    ),
  };
}

export async function GET() {
  try {
    const options = await getOrSetCache(
      FILTER_OPTIONS_CACHE_KEY,
      CACHE_TTL_MS,
      loadFilterOptions
    );

    return NextResponse.json(options);
  } catch (error) {
    console.error("Investor filters API error:", error);

    return NextResponse.json(
      { error: "Failed to fetch filter options" },
      { status: 500 }
    );
  }
}
