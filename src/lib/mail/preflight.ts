import { promises as dns } from "node:dns";
import type { Pool } from "pg";
import { dailySendLimit } from "./config";

/**
 * Checks run before an email goes to the mail server. Each one prevents a
 * bounce, a duplicate or a spam-looking message, since those are what make a
 * mailbox's future mail land in spam.
 */

export type PreflightProblem = { status: number; error: string; code: string; addresses?: string[] };

const DOMAIN_CACHE_MS = 12 * 60 * 60 * 1000;
const DNS_TIMEOUT_MS = 3000;
const DUPLICATE_WINDOW_MINUTES = 3;

const globalForPreflight = globalThis as unknown as { mailDomains?: Map<string, { ok: boolean; at: number }> };

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), DNS_TIMEOUT_MS)),
  ]);
}

/** "No such domain" / "no records": the domain definitely can't receive mail. */
function isDefinitelyMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
}

/**
 * Whether a domain accepts email: it has MX records, or (as mail servers fall
 * back to) an address record. DNS hiccups count as "yes" so a slow lookup never
 * blocks a real send.
 */
async function domainAcceptsMail(domain: string): Promise<boolean> {
  const cache = (globalForPreflight.mailDomains ??= new Map());
  const cached = cache.get(domain);
  if (cached && Date.now() - cached.at < DOMAIN_CACHE_MS) return cached.ok;

  let ok = true;
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    // A "null MX" (a single record pointing at ".") means the domain never accepts mail.
    ok = mx.some((record) => record.exchange && record.exchange !== ".");
  } catch (error) {
    if (!isDefinitelyMissing(error)) return true;
    try {
      await withTimeout(dns.resolve4(domain));
    } catch (fallbackError) {
      ok = !isDefinitelyMissing(fallbackError);
    }
  }
  cache.set(domain, { ok, at: Date.now() });
  return ok;
}

/** Recipients whose domain can't receive email (typos like gmial.com, dead company domains). */
export async function undeliverableDomains(addresses: string[]): Promise<string[]> {
  const domains = Array.from(new Set(addresses.map((address) => address.split("@")[1]).filter(Boolean)));
  const results = await Promise.all(domains.map(async (domain) => ({ domain, ok: await domainAcceptsMail(domain) })));
  const bad = new Set(results.filter((result) => !result.ok).map((result) => result.domain));
  return addresses.filter((address) => bad.has(address.split("@")[1]));
}

/** {{placeholders}} left in the text after filling in the investor's details. */
export function unfilledPlaceholders(...texts: string[]): string[] {
  const found = texts.flatMap((text) => text.match(/\{\{[^{}]{0,40}\}\}/g) ?? []);
  return Array.from(new Set(found));
}

/** Runs the database checks: earlier bounces, the daily limit, and accidental double sends. */
export async function preflightChecks(
  db: Pick<Pool, "query">,
  params: { companyId: string; recipients: string[]; subject: string; allowBounced: boolean }
): Promise<PreflightProblem | null> {
  const { companyId, recipients, subject } = params;

  const [bounced, usage, duplicate] = await Promise.all([
    params.allowBounced
      ? Promise.resolve({ rows: [] as { address: string }[] })
      : db.query<{ address: string }>(
          `SELECT DISTINCT address FROM emails e, unnest(e.bounced_addresses) AS address
           WHERE e.company_id = $1 AND e.bounced_addresses && $2::text[] AND address = ANY($2::text[])`,
          [companyId, recipients]
        ),
    db.query<{ recipients: number; oldest: Date | null }>(
      `SELECT coalesce(sum(cardinality(to_addresses) + cardinality(cc_addresses)), 0)::int AS recipients,
              min(occurred_at) AS oldest
       FROM emails
       -- Mail sent straight from the mailbox app counts against the same limit.
       WHERE company_id = $1 AND direction = 'outbound' AND status = 'sent'
         AND occurred_at > now() - interval '24 hours'`,
      [companyId]
    ),
    db.query(
      `SELECT 1 FROM emails
       WHERE company_id = $1 AND direction = 'outbound' AND status = 'sent' AND subject = $2
         AND to_addresses && $3::text[] AND occurred_at > now() - make_interval(mins => $4)
       LIMIT 1`,
      [companyId, subject, recipients, DUPLICATE_WINDOW_MINUTES]
    ),
  ]);

  if (bounced.rows.length > 0) {
    const addresses = bounced.rows.map((row) => row.address);
    return {
      status: 409,
      code: "bounced_before",
      addresses,
      error: `An earlier email to ${addresses.join(", ")} bounced, so this address probably doesn't work. Sending to it again hurts how often your mail reaches inboxes.`,
    };
  }

  const limit = dailySendLimit(companyId);
  if (usage.rows[0].recipients + recipients.length > limit) {
    // Room frees up as the oldest email in the 24-hour window drops out of it.
    const oldest = usage.rows[0].oldest;
    const freesAt = oldest
      ? new Date(new Date(oldest).getTime() + 24 * 60 * 60 * 1000).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "numeric",
          minute: "2-digit",
          day: "numeric",
          month: "short",
        })
      : null;
    return {
      status: 429,
      code: "daily_limit",
      error: `Your company's mailbox has sent to ${usage.rows[0].recipients} people in the last 24 hours, and its daily limit is ${limit}. Going over it gets the mailbox blocked and sends mail to spam.${
        freesAt ? ` You can send again from about ${freesAt} (India time).` : ""
      }`,
    };
  }

  if (duplicate.rows.length > 0) {
    return {
      status: 409,
      code: "duplicate",
      error: `The same email was sent to this address in the last ${DUPLICATE_WINDOW_MINUTES} minutes. Check the timeline before sending again.`,
    };
  }
  return null;
}
