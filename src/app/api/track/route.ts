import { NextRequest, NextResponse } from "next/server";
import { auditLater } from "../../../lib/audit";
import { requireSession } from "../../../lib/auth/session";

/** Actions that happen only in the browser (downloads, clipboard) but still belong in the audit log. */
const CLIENT_ACTIONS = new Set(["csv_exported", "emails_copied", "linkedin_copied"]);
const MAX_DETAIL_KEYS = 20;

/** Keeps only short plain values (counts, ids, file names). */
function cleanDetails(input: unknown): Record<string, string | number | boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const details: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input).slice(0, MAX_DETAIL_KEYS)) {
    if (typeof value === "number" || typeof value === "boolean") details[key.slice(0, 40)] = value;
    else if (typeof value === "string") details[key.slice(0, 40)] = value.slice(0, 200);
  }
  return details;
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (typeof action !== "string" || !CLIENT_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  auditLater(request, session, { action, details: cleanDetails(body.details) });
  return NextResponse.json({ ok: true });
}
