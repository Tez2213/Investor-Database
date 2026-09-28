import { NextRequest, after } from "next/server";
import { pool } from "../../../../lib/db";
import { logActivities } from "../../../../lib/activity";
import { clientInfo } from "../../../../lib/audit";

/** A transparent 1x1 GIF. */
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * Open-tracking image embedded in emails sent from the portal. It is public
 * (mail apps have no session) and always returns the image; the open is
 * recorded after the response so the recipient's mail app never waits.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    const { ip } = clientInfo(request);
    after(() => recordOpen(token, ip).catch((error) => console.warn("Could not record email open:", error)));
  }
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      // Every open should reach us, not a cached copy.
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}

async function recordOpen(token: string, ip: string | null) {
  // Not counted: loads within seconds of sending (mail-server scanners), and
  // loads from an IP your own team has used, e.g. viewing the Sent folder.
  const result = await pool.query<{ id: string; company_id: string; open_count: number; to_addresses: string[] }>(
    `UPDATE emails e
     SET open_count = open_count + 1, opened_at = coalesce(opened_at, now()), last_opened_at = now()
     WHERE open_token = $1 AND status = 'sent'
       AND now() - occurred_at > interval '5 seconds'
       AND NOT EXISTS (
         SELECT 1 FROM audit_log a
         WHERE a.company_id = e.company_id AND a.ip = $2 AND a.created_at > now() - interval '30 days'
       )
     RETURNING id, company_id, open_count, to_addresses`,
    [token, ip]
  );
  const email = result.rows[0];
  // Only the first open goes on the timeline; later ones just raise the count.
  if (!email || email.open_count !== 1) return;

  const investors = await pool.query<{ investor_id: string; name: string | null }>(
    `SELECT DISTINCT a.investor_id, nullif(trim(concat_ws(' ', i.first_name, i.last_name)), '') AS name
     FROM investor_activities a JOIN investors i ON i.id = a.investor_id
     WHERE a.email_id = $1 AND a.kind = 'email_sent'`,
    [email.id]
  );
  await logActivities(
    pool,
    investors.rows.map((row) => ({
      investorId: row.investor_id,
      companyId: email.company_id,
      kind: "email_opened" as const,
      actor: row.name || email.to_addresses[0] || "Recipient",
      emailId: email.id,
    }))
  );
}
