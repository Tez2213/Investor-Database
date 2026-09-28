import { pool } from "./db";
import { FILTER_OPTIONS_CACHE_KEY, getOrSetCache } from "./cache";
import type { FilterOptions } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;

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

/** Countries and industries are shared by everyone, so they're cached. */
export function sharedFilterOptions() {
  return getOrSetCache(FILTER_OPTIONS_CACHE_KEY, CACHE_TTL_MS, loadSharedOptions);
}
