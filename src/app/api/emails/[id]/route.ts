import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { investorAccessCondition } from "../../../../lib/access";
import { emailSummaryColumns } from "../../../../lib/emailColumns";
import { parseId } from "../../../../lib/parseId";
import type { EmailMessage } from "../../../../lib/types";

const MESSAGE_COLUMNS = `${emailSummaryColumns("e")}, e.text_body, e.html_body, e.message_id, e.in_reply_to, e.thread_id, e.sent_by,
  nullif(trim(concat_ws(' ', i.first_name, i.last_name)), '') AS investor_name`;

/**
 * One of this company's emails plus the rest of its conversation (oldest first). Marks it read.
 * Members limited to assigned investors only see mail linked to those investors.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid email id" }, { status: 400 });
  }

  const values: unknown[] = [id, session.companyId];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const access = investorAccessCondition(session, "e.investor_id", param);
  const accessClause = access ? `AND ${access}` : "";

  try {
    const result = await pool.query<EmailMessage>(
      `SELECT ${MESSAGE_COLUMNS} FROM emails e LEFT JOIN investors i ON i.id = e.investor_id
       WHERE e.id = $1 AND e.company_id = $2 ${accessClause}`,
      values
    );
    const email = result.rows[0];
    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    // Same access rule for the rest of the conversation ($1 is reused for the thread id).
    const threadValues = [...values];
    threadValues[0] = email.thread_id;
    const [thread] = await Promise.all([
      pool.query<EmailMessage>(
        `SELECT ${MESSAGE_COLUMNS} FROM emails e LEFT JOIN investors i ON i.id = e.investor_id
         WHERE e.thread_id = $1 AND e.company_id = $2 ${accessClause}
         ORDER BY e.occurred_at ASC, e.id ASC LIMIT 50`,
        threadValues
      ),
      email.is_read
        ? null
        : pool.query(
            `UPDATE emails e SET is_read = true
             WHERE e.thread_id = $1 AND e.company_id = $2 AND NOT e.is_read ${accessClause}`,
            threadValues
          ),
    ]);

    return NextResponse.json({ data: email, thread: thread.rows });
  } catch (error) {
    console.error("Email detail API error:", error);
    return NextResponse.json({ error: "Failed to load email" }, { status: 500 });
  }
}

/** Marks an email read or unread. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const id = parseId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid email id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.is_read !== "boolean") {
    return NextResponse.json({ error: "is_read must be true or false" }, { status: 400 });
  }

  const values: unknown[] = [id, session.companyId, body.is_read];
  const access = investorAccessCondition(session, "e.investor_id", (value) => {
    values.push(value);
    return `$${values.length}`;
  });
  try {
    const result = await pool.query(
      `UPDATE emails e SET is_read = $3 WHERE e.id = $1 AND e.company_id = $2 ${access ? `AND ${access}` : ""}`,
      values
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Email update API error:", error);
    return NextResponse.json({ error: "Failed to update email" }, { status: 500 });
  }
}
