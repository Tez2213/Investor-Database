import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import { parseId } from "../../../../../lib/parseId";

/** Deletes one of the signed-in person's own templates. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: "Invalid template id" }, { status: 400 });

  try {
    const result = await pool.query("DELETE FROM email_templates WHERE id = $1 AND user_id = $2", [id, session.userId]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete email template API error:", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
