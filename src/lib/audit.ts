import { after, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { pool } from "./db";
import type { Session } from "./auth/session";

type Queryable = Pick<PoolClient, "query">;

export type AuditEntry = {
  action: string;
  investorId?: number | string | null;
  details?: Record<string, unknown>;
  /** Override for events without a session (e.g. failed login). */
  email?: string | null;
  companyId?: string | null;
};

function clientInfo(request: NextRequest | null) {
  if (!request) return { ip: null, userAgent: null };
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/**
 * Records an audit entry after the response has been sent, so tracking never
 * slows the user down. Use inside route handlers.
 */
export function auditLater(request: NextRequest, session: Session | null, entry: AuditEntry): void {
  const info = clientInfo(request);
  after(() => writeAudit(info, session, entry, pool));
}

/**
 * Records an entry in the admin audit log. Never throws: tracking must not
 * break the action being tracked.
 */
export async function audit(
  request: NextRequest | null,
  session: Session | null,
  entry: AuditEntry,
  db: Queryable = pool
): Promise<void> {
  await writeAudit(clientInfo(request), session, entry, db);
}

async function writeAudit(
  { ip, userAgent }: { ip: string | null; userAgent: string | null },
  session: Session | null,
  entry: AuditEntry,
  db: Queryable
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log (user_id, user_email, company_id, action, investor_id, details, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        session?.userId ?? null,
        entry.email ?? session?.email ?? null,
        entry.companyId ?? session?.companyId ?? null,
        entry.action,
        entry.investorId ?? null,
        JSON.stringify(entry.details ?? {}),
        ip,
        userAgent,
      ]
    );
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}
