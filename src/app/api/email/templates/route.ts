import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import type { EmailTemplate } from "../../../../lib/types";

const MAX_TEMPLATES = 100;
const MAX_NAME_LENGTH = 80;
const MAX_SUBJECT_LENGTH = 300;
const MAX_BODY_LENGTH = 50_000;

/** Postgres "relation does not exist": the templates migration hasn't been run yet. */
function isMissingTable(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

/** The signed-in person's saved templates. */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await pool.query<EmailTemplate>(
      `SELECT id, name, subject, body, updated_at FROM email_templates
       WHERE user_id = $1 ORDER BY lower(name)`,
      [session.userId]
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    if (isMissingTable(error)) return NextResponse.json({ data: [], unavailable: true });
    console.error("Email templates API error:", error);
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
  }
}

/** Saves a template. Saving under a name that already exists replaces that template. */
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const text = typeof body?.body === "string" ? body.body.replace(/\s+$/, "") : "";
  if (!name) return NextResponse.json({ error: "Give the template a name" }, { status: 400 });
  if (!subject && !text.trim()) {
    return NextResponse.json({ error: "Write a subject or message first" }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH || subject.length > MAX_SUBJECT_LENGTH || text.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: "Name, subject or message is too long" }, { status: 400 });
  }

  try {
    const existing = await pool.query<{ total: number; same_name: boolean }>(
      `SELECT count(*)::int AS total, bool_or(lower(name) = lower($2)) AS same_name
       FROM email_templates WHERE user_id = $1`,
      [session.userId, name]
    );
    if (!existing.rows[0].same_name && existing.rows[0].total >= MAX_TEMPLATES) {
      return NextResponse.json({ error: `You can keep up to ${MAX_TEMPLATES} templates. Delete one first.` }, { status: 400 });
    }

    const result = await pool.query<EmailTemplate>(
      `INSERT INTO email_templates (user_id, name, subject, body)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, lower(name))
       DO UPDATE SET name = EXCLUDED.name, subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = now()
       RETURNING id, name, subject, body, updated_at`,
      [session.userId, name, subject, text]
    );
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "Templates aren't set up yet. Ask your admin to run the latest update." }, { status: 503 });
    }
    console.error("Save email template API error:", error);
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  }
}
