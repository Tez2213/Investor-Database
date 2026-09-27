import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../lib/db";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseHasFilter(value: string | null): "all" | "yes" | "no" {
  return value === "yes" || value === "no" ? value : "all";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search")?.trim() || "";
    const country = searchParams.get("country")?.trim() || "";
    const city = searchParams.get("city")?.trim() || "";
    const industry = searchParams.get("industry")?.trim() || "";
    const title = searchParams.get("title")?.trim() || "";
    const quality = searchParams.get("quality")?.trim() || "";
    const hasEmail = parseHasFilter(searchParams.get("hasEmail"));
    const hasLinkedIn = parseHasFilter(searchParams.get("hasLinkedIn"));

    const limit = Math.min(
      Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    const rawCursor = Number(searchParams.get("cursor"));
    const cursor = Number.isFinite(rawCursor) && rawCursor > 0 ? rawCursor : 0;

    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (search) {
      values.push(`%${search}%`);

      conditions.push(`
        (
          first_name ILIKE $${values.length}
          OR last_name ILIKE $${values.length}
          OR company_name ILIKE $${values.length}
          OR title ILIKE $${values.length}
          OR industry ILIKE $${values.length}
          OR city ILIKE $${values.length}
          OR country ILIKE $${values.length}
          OR email ILIKE $${values.length}
        )
      `);
    }

    if (country) {
      values.push(country);
      conditions.push(`country = $${values.length}`);
    }

    if (city) {
      values.push(`%${city}%`);
      conditions.push(`city ILIKE $${values.length}`);
    }

    if (industry) {
      values.push(industry);
      conditions.push(`industry = $${values.length}`);
    }

    if (title) {
      values.push(`%${title}%`);
      conditions.push(`title ILIKE $${values.length}`);
    }

    if (quality) {
      values.push(quality);
      conditions.push(`quality = $${values.length}`);
    }

    if (hasEmail === "yes") {
      conditions.push(`(email IS NOT NULL AND email <> '')`);
    } else if (hasEmail === "no") {
      conditions.push(`(email IS NULL OR email = '')`);
    }

    if (hasLinkedIn === "yes") {
      conditions.push(`(linkedin IS NOT NULL AND linkedin <> '')`);
    } else if (hasLinkedIn === "no") {
      conditions.push(`(linkedin IS NULL OR linkedin = '')`);
    }

    if (cursor > 0) {
      values.push(cursor);
      conditions.push(`id > $${values.length}`);
    }

    values.push(limit);

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        id,
        first_name,
        last_name,
        title,
        company_name,
        email,
        linkedin,
        quality,
        industry,
        website,
        company_linkedin_url,
        city,
        country
      FROM investors
      ${whereClause}
      ORDER BY id ASC
      LIMIT $${values.length}
    `;

    const result = await pool.query(query, values);

    const investors = result.rows;

    const nextCursor =
      investors.length === limit
        ? investors[investors.length - 1].id
        : null;

    return NextResponse.json({
      data: investors,
      nextCursor,
      hasMore: nextCursor !== null,
    });
  } catch (error) {
    console.error("Investor API error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch investors",
      },
      {
        status: 500,
      }
    );
  }
}
