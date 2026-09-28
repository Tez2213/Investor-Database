import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requireSession } from "../../../lib/auth/session";
import { TOTAL_COUNT_CACHE_KEY, getOrSetCache } from "../../../lib/cache";

const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadTotalInvestors(): Promise<number> {
  const result = await pool.query<{ count: string }>(`SELECT COUNT(*)::bigint AS count FROM investors`);
  return Number(result.rows[0]?.count ?? 0);
}

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  try {
    const totalInvestors = await getOrSetCache(TOTAL_COUNT_CACHE_KEY, CACHE_TTL_MS, loadTotalInvestors);
    return NextResponse.json({ totalInvestors });
  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
