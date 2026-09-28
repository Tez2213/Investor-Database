import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { auditLater } from "../../../../lib/audit";
import { actorName, requireSession } from "../../../../lib/auth/session";
import { FILTER_OPTIONS_CACHE_KEY, invalidateCache } from "../../../../lib/cache";
import { parseCompanyDataChanges, updateCompanyData } from "../../../../lib/companyData";
import { applyInvestorChanges, parseInvestorChanges } from "../../../../lib/investorChanges";
import { loadInvestors } from "../../../../lib/investorQuery";

const MAX_BULK_IDS = 5000;
const COMPANY_KEYS = new Set(["quality", "notes", "tags"]);

/**
 * Applies the same change to many investors. `quality`, `notes` and `tags` are
 * saved for the signed-in company only; other fields update the shared record.
 */
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ids, changes } = (body ?? {}) as { ids?: unknown; changes?: unknown };

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK_IDS) {
    return NextResponse.json({ error: `Provide between 1 and ${MAX_BULK_IDS} investor ids` }, { status: 400 });
  }
  const numericIds = Array.from(new Set(ids.map(Number)));
  if (numericIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "Invalid investor id" }, { status: 400 });
  }
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return NextResponse.json({ error: "Changes must be an object" }, { status: 400 });
  }

  const entries = Object.entries(changes as Record<string, unknown>);
  const companyPart = Object.fromEntries(entries.filter(([key]) => COMPANY_KEYS.has(key)));
  const sharedPart = Object.fromEntries(entries.filter(([key]) => !COMPANY_KEYS.has(key)));

  const companyChanges = Object.keys(companyPart).length > 0 ? parseCompanyDataChanges(companyPart) : null;
  if (companyChanges && "error" in companyChanges) {
    return NextResponse.json({ error: companyChanges.error }, { status: 400 });
  }
  const sharedChanges = Object.keys(sharedPart).length > 0 ? parseInvestorChanges(sharedPart) : null;
  if (sharedChanges && "error" in sharedChanges) {
    return NextResponse.json({ error: sharedChanges.error }, { status: 400 });
  }
  if (!companyChanges && !sharedChanges) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const actor = actorName(session);
  try {
    if (sharedChanges) {
      await applyInvestorChanges(pool, numericIds, sharedChanges.changes, { actor, companyId: session.companyId });
      invalidateCache(FILTER_OPTIONS_CACHE_KEY);
    }
    if (companyChanges) {
      await updateCompanyData(pool, { companyId: session.companyId, ids: numericIds, actor, changes: companyChanges });
    }

    auditLater(request, session, {
      action: "bulk_update",
      details: { count: numericIds.length, fields: entries.map(([key]) => key), changes },
    });

    const rows = await loadInvestors(pool, numericIds, session.companyId);
    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("Investor bulk update API error:", error);
    return NextResponse.json({ error: "Failed to update investors" }, { status: 500 });
  }
}
