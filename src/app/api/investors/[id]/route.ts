import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { auditLater } from "../../../../lib/audit";
import { actorName, requireSession } from "../../../../lib/auth/session";
import { FILTER_OPTIONS_CACHE_KEY, invalidateCache } from "../../../../lib/cache";
import { applyInvestorChanges, parseInvestorChanges } from "../../../../lib/investorChanges";
import { investorSelect } from "../../../../lib/investorQuery";
import { parseId } from "../../../../lib/parseId";
import type { InvestorProfile, InvestorProfileResponse } from "../../../../lib/types";

/** Full profile as the signed-in company sees it, plus neighbours and engagement stats. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid investor id" }, { status: 400 });
  }

  try {
    const [investor, neighbours, stats] = await Promise.all([
      pool.query<InvestorProfile>(
        `${investorSelect("$1", ", mine.notes, coalesce(mine.tags, '{}') AS tags, uploader.email AS uploaded_by_email")}
         LEFT JOIN auth_users uploader ON uploader.id = i.uploaded_by
         WHERE i.id = $2`,
        [session.companyId, id]
      ),
      pool.query<{ prev_id: string | null; next_id: string | null }>(
        `SELECT (SELECT max(id) FROM investors WHERE id < $1) AS prev_id,
                (SELECT min(id) FROM investors WHERE id > $1) AS next_id`,
        [id]
      ),
      pool.query<{ sent: string; opened: string; received: string; comments: string; last_email_at: string | null }>(
        `SELECT count(*) FILTER (WHERE kind = 'email_sent') AS sent,
                count(*) FILTER (WHERE kind = 'email_opened') AS opened,
                count(*) FILTER (WHERE kind = 'email_received') AS received,
                count(*) FILTER (WHERE kind = 'comment') AS comments,
                max(created_at) FILTER (WHERE kind IN ('email_sent', 'email_received')) AS last_email_at
         FROM investor_activities WHERE company_id = $1 AND investor_id = $2`,
        [session.companyId, id]
      ),
    ]);

    if (investor.rowCount === 0) {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }

    auditLater(request, session, { action: "investor_viewed", investorId: id });

    const counts = stats.rows[0];
    const response: InvestorProfileResponse = {
      data: investor.rows[0],
      prevId: neighbours.rows[0].prev_id,
      nextId: neighbours.rows[0].next_id,
      stats: {
        emailsSent: Number(counts.sent),
        emailsOpened: Number(counts.opened),
        emailsReceived: Number(counts.received),
        comments: Number(counts.comments),
        lastEmailAt: counts.last_email_at,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Investor profile API error:", error);
    return NextResponse.json({ error: "Failed to load investor" }, { status: 500 });
  }
}

/** Edits shared investor fields (name, email, company…). Visible to every company. */
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseInvestorChanges(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { rows } = await applyInvestorChanges(pool, [id], parsed.changes, {
      actor: actorName(session),
      companyId: session.companyId,
    });
    if (rows.length === 0) {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }

    invalidateCache(FILTER_OPTIONS_CACHE_KEY);
    auditLater(request, session, {
      action: "investor_updated",
      investorId: id,
      details: { fields: parsed.changes.map(([key]) => key) },
    });

    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    console.error("Investor update API error:", error);
    return NextResponse.json({ error: "Failed to update investor" }, { status: 500 });
  }
}
