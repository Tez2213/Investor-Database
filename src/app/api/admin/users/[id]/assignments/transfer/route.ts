import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../../../../lib/db";
import { auditLater } from "../../../../../../../lib/audit";
import { requireAdmin } from "../../../../../../../lib/auth/adminSession";
import { withTransaction } from "../../../../../../../lib/activity";
import { loadAssignmentTarget } from "../../../../../../../lib/assignments";
import { parseId } from "../../../../../../../lib/parseId";

/**
 * Moves or copies every investor assigned to this person to someone else, e.g.
 * when an employee leaves. Body: { toUserId, mode: "move" | "copy" }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const fromId = parseId((await params).id);
  const body = await request.json().catch(() => null);
  const toId = parseId(body?.toUserId);
  const mode = body?.mode === "copy" ? "copy" : body?.mode === "move" ? "move" : null;
  if (fromId === null || toId === null || !mode) {
    return NextResponse.json({ error: "Choose who to transfer to, and move or copy" }, { status: 400 });
  }
  if (fromId === toId) return NextResponse.json({ error: "Pick a different person" }, { status: 400 });

  const [from, to] = await Promise.all([loadAssignmentTarget(pool, fromId), loadAssignmentTarget(pool, toId)]);
  if (!from || !to) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const actor = admin.name || admin.email;
  try {
    const result = await withTransaction(pool, async (client) => {
      const batch = await client.query<{ id: string }>(
        `INSERT INTO assignment_batches (user_id, description, criteria, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [to.id, `${mode === "move" ? "Moved" : "Copied"} from ${from.name || from.email}`, JSON.stringify({ fromUserId: from.id, mode }), actor]
      );
      const inserted = await client.query(
        `INSERT INTO user_investor_assignments (user_id, investor_id, batch_id, assigned_by)
         SELECT $1, investor_id, $2, $3 FROM user_investor_assignments WHERE user_id = $4
         ON CONFLICT (user_id, investor_id) DO NOTHING`,
        [to.id, batch.rows[0].id, actor, from.id]
      );
      const added = inserted.rowCount ?? 0;
      if (added === 0) await client.query("DELETE FROM assignment_batches WHERE id = $1", [batch.rows[0].id]);
      else await client.query("UPDATE assignment_batches SET added_count = $2 WHERE id = $1", [batch.rows[0].id, added]);

      let removed = 0;
      if (mode === "move") {
        const deleted = await client.query("DELETE FROM user_investor_assignments WHERE user_id = $1", [from.id]);
        await client.query("DELETE FROM assignment_batches WHERE user_id = $1", [from.id]);
        removed = deleted.rowCount ?? 0;
      }
      return { added, removed };
    });

    auditLater(request, admin, {
      action: "assignments_transferred",
      companyId: to.company_id,
      details: { from: from.email, to: to.email, mode, ...result },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Assignment transfer API error:", error);
    return NextResponse.json({ error: "Failed to transfer assignments" }, { status: 500 });
  }
}
