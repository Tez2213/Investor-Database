import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { getOrSetCache } from "../../../lib/cache";

const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadTotalInvestors(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::bigint AS count FROM investors`
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function GET() {
  try {
    const totalInvestors = await getOrSetCache(
      "investor-total-count",
      CACHE_TTL_MS,
      loadTotalInvestors
    );

    return NextResponse.json({ totalInvestors });
  } catch (error) {
    console.error("Stats API error:", error);

    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
