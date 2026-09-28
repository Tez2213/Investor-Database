import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requireSession } from "../../../lib/auth/session";
import { isCompanyId } from "../../../lib/companies";
import { parseInvestorCode } from "../../../lib/format";
import { investorSelect, outreachCondition, teamScoreCondition } from "../../../lib/investorQuery";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseHasFilter(value: string | null): "all" | "yes" | "no" {
  return value === "yes" || value === "no" ? value : "all";
}

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  try {
    const { searchParams } = request.nextUrl;

    const search = searchParams.get("search")?.trim() || "";
    const country = searchParams.get("country")?.trim() || "";
    const city = searchParams.get("city")?.trim() || "";
    const industry = searchParams.get("industry")?.trim() || "";
    const title = searchParams.get("title")?.trim() || "";
    const quality = searchParams.get("quality")?.trim() || "";
    const teamScore = searchParams.get("teamScore")?.trim() || "";
    const source = searchParams.get("source")?.trim() || "";
    const contacted = searchParams.get("contacted")?.trim() || "";
    const hasEmail = parseHasFilter(searchParams.get("hasEmail"));
    const hasLinkedIn = parseHasFilter(searchParams.get("hasLinkedIn"));

    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rawCursor = Number(searchParams.get("cursor"));
    const cursor = Number.isFinite(rawCursor) && rawCursor > 0 ? rawCursor : 0;

    // $1 is always the viewing company.
    const values: Array<string | number> = [session.companyId];
    const conditions: string[] = [];
    const param = (value: string | number) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (search) {
      // Searching an investor ID ("INV-000123", "#123" or "123") also matches that row.
      const searchId = parseInvestorCode(search);
      const idCondition = searchId !== null ? `i.id = ${param(searchId)} OR` : "";
      const like = param(`%${search}%`);
      conditions.push(`(
        ${idCondition}
        i.first_name ILIKE ${like} OR i.last_name ILIKE ${like} OR i.company_name ILIKE ${like}
        OR i.title ILIKE ${like} OR i.industry ILIKE ${like} OR i.city ILIKE ${like}
        OR i.country ILIKE ${like} OR i.email ILIKE ${like}
      )`);
    }

    if (country) conditions.push(`i.country = ${param(country)}`);
    if (city) conditions.push(`i.city ILIKE ${param(`%${city}%`)}`);
    if (industry) conditions.push(`i.industry = ${param(industry)}`);
    if (title) conditions.push(`i.title ILIKE ${param(`%${title}%`)}`);
    if (quality) conditions.push(`mine.quality = ${param(quality)}`);

    const scoreCondition = teamScoreCondition(teamScore);
    if (scoreCondition) {
      conditions.push(`(${scoreCondition})`);
      if (teamScore !== "unrated") {
        // Only rated investors can match: lets Postgres start from the small ratings table.
        conditions.push("i.id IN (SELECT investor_id FROM investor_company_data WHERE quality IS NOT NULL)");
      }
    }

    if (source === "original") conditions.push("i.source_company_id IS NULL");
    else if (source === "uploaded") conditions.push("i.source_company_id IS NOT NULL");
    else if (isCompanyId(source)) conditions.push(`i.source_company_id = ${param(source)}`);

    const contactedCondition = outreachCondition(contacted, "$1");
    if (contactedCondition) conditions.push(contactedCondition);

    if (hasEmail === "yes") conditions.push(`(i.email IS NOT NULL AND i.email <> '')`);
    else if (hasEmail === "no") conditions.push(`(i.email IS NULL OR i.email = '')`);

    if (hasLinkedIn === "yes") conditions.push(`(i.linkedin IS NOT NULL AND i.linkedin <> '')`);
    else if (hasLinkedIn === "no") conditions.push(`(i.linkedin IS NULL OR i.linkedin = '')`);

    if (cursor > 0) conditions.push(`i.id > ${param(cursor)}`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `${investorSelect("$1")} ${whereClause} ORDER BY i.id ASC LIMIT ${param(limit)}`,
      values
    );

    const investors = result.rows;
    const nextCursor = investors.length === limit ? investors[investors.length - 1].id : null;

    return NextResponse.json({ data: investors, nextCursor, hasMore: nextCursor !== null });
  } catch (error) {
    console.error("Investor API error:", error);
    return NextResponse.json({ error: "Failed to fetch investors" }, { status: 500 });
  }
}
