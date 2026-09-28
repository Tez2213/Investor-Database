import type { ParsedMail } from "mailparser";
import type { PoolClient } from "pg";
import { logActivities } from "../activity";

export const UNDELIVERABLE_QUALITY = "Low";
const ADDRESS = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Marks investors whose email could not be delivered as Low quality for this
 * company, with a timeline entry saying why. Investors already rated Low are left alone.
 */
export async function markUndeliverable(
  db: PoolClient,
  params: { companyId: string; investorIds: (string | number)[]; reason: string; emailId?: string | null }
): Promise<string[]> {
  const ids = Array.from(new Set(params.investorIds.map(String)));
  if (ids.length === 0) return [];

  const before = await db.query<{ id: string; quality: string | null }>(
    `SELECT i.id, d.quality FROM investors i
     LEFT JOIN investor_company_data d ON d.investor_id = i.id AND d.company_id = $1
     WHERE i.id = ANY($2::bigint[])
     FOR UPDATE OF i`,
    [params.companyId, ids]
  );
  const changed = before.rows.filter((row) => row.quality !== UNDELIVERABLE_QUALITY);
  if (changed.length === 0) return [];

  const actor = "Auto: email not delivered";
  await db.query(
    `INSERT INTO investor_company_data (investor_id, company_id, quality, updated_at, updated_by)
     SELECT id, $1, $3, now(), $4 FROM unnest($2::bigint[]) AS id
     ON CONFLICT (investor_id, company_id) DO UPDATE
       SET quality = EXCLUDED.quality, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [params.companyId, changed.map((row) => row.id), UNDELIVERABLE_QUALITY, actor]
  );
  await logActivities(
    db,
    changed.map((row) => ({
      investorId: row.id,
      companyId: params.companyId,
      kind: "field_change" as const,
      actor,
      body: params.reason,
      emailId: params.emailId ?? null,
      details: { changes: [{ field: "quality", from: row.quality, to: UNDELIVERABLE_QUALITY }], automatic: true },
    }))
  );
  return changed.map((row) => row.id);
}

/** Whether an incoming message is a "delivery failed" notice (not a delay warning). */
export function isBounce(parsed: ParsedMail, fromAddress: string): boolean {
  const subject = parsed.subject ?? "";
  if (/delay|delayed|warning|will retry|still trying/i.test(subject)) return false;
  const contentType = parsed.headers.get("content-type") as { params?: Record<string, string> } | undefined;
  if (contentType?.params?.["report-type"]?.toLowerCase() === "delivery-status") return true;
  const daemon = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/i.test(fromAddress);
  const failureSubject =
    /undeliver|undelivered|delivery (status notification \(failure\)|has failed|failed|failure)|failure notice|returned mail|mail delivery (failed|subsystem)|could not be delivered|address not found|message not delivered/i.test(
      subject
    );
  return failureSubject || (daemon && !/auto.?reply|out of office/i.test(subject));
}

/**
 * Addresses a bounce says could not be reached. Reads the machine-readable
 * delivery report when there is one; otherwise every address in the notice
 * (the caller only acts on ones this company actually emailed).
 */
export function bouncedAddresses(parsed: ParsedMail, ownAddresses: string[]): { addresses: string[]; fromReport: boolean } {
  const own = new Set(ownAddresses.map((address) => address.toLowerCase()));
  const reports = parsed.attachments
    .filter((attachment) => /delivery-status/i.test(attachment.contentType))
    .map((attachment) => attachment.content.toString("utf8"));
  // mailparser usually folds the delivery report into the plain text.
  if (parsed.text && /Final-Recipient:/i.test(parsed.text)) reports.push(parsed.text);

  const failed = new Set<string>();
  for (const report of reports) {
    // Each recipient block: Final-Recipient / Original-Recipient ... Action: failed
    for (const block of report.split(/\r?\n\r?\n/)) {
      const recipient = block.match(/(?:Final|Original)-Recipient:\s*[^;]*;\s*<?([^\s>]+@[^\s>]+)>?/i)?.[1];
      if (!recipient) continue;
      const action = block.match(/Action:\s*(\w+)/i)?.[1]?.toLowerCase();
      if (!action || action === "failed") failed.add(recipient.toLowerCase());
    }
  }
  if (failed.size > 0) return { addresses: [...failed].filter((address) => !own.has(address)), fromReport: true };

  // Only the notice itself, not the copy of the original message quoted below
  // it (which lists every recipient, including ones that did get the email).
  const notice = (parsed.text ?? "").split(
    /-{2,}\s*(?:original message|below this line)|^\s*original message|^\s*reporting-mta:|^\s*received:|^\s*from:.*\n\s*(?:to|date|subject):/im
  )[0];
  const found = new Set((notice.match(ADDRESS) ?? []).map((address) => address.toLowerCase()));
  return {
    addresses: [...found].filter((address) => !own.has(address) && !/^(mailer-daemon|postmaster)@/i.test(address)),
    fromReport: false,
  };
}
