import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { auditLater } from "../../../../../lib/audit";
import { actorName, requireSession } from "../../../../../lib/auth/session";
import { NOT_ASSIGNED_ERROR, canAccessInvestor } from "../../../../../lib/access";
import { parseCompanyDataChanges, updateCompanyData } from "../../../../../lib/companyData";
import { investorSelect } from "../../../../../lib/investorQuery";
import { parseId } from "../../../../../lib/parseId";
import type { InvestorProfile } from "../../../../../lib/types";

/** Updates this company's own quality rating, notes and/or tags for an investor. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid investor id" }, { status: 400 });
  }

  const parsed = parseCompanyDataChanges(await request.json().catch(() => null));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    if (!(await canAccessInvestor(pool, session, id))) {
      return NextResponse.json({ error: NOT_ASSIGNED_ERROR, code: "not_assigned" }, { status: 403 });
    }
    const result = await updateCompanyData(pool, {
      companyId: session.companyId,
      ids: [id],
      actor: actorName(session),
      changes: parsed,
    });
    if (result.ids.length === 0) {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }

    auditLater(request, session, {
      action: "investor_company_data_updated",
      investorId: id,
      details: { fields: Object.keys(parsed), quality: parsed.quality, tags: parsed.tags },
    });

    const row = await pool.query<InvestorProfile>(
      `${investorSelect("$1", ", mine.notes, coalesce(mine.tags, '{}') AS tags, uploader.email AS uploaded_by_email")}
       LEFT JOIN auth_users uploader ON uploader.id = i.uploaded_by
       WHERE i.id = $2`,
      [session.companyId, id]
    );
    return NextResponse.json({ data: row.rows[0] });
  } catch (error) {
    console.error("Company data update API error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
