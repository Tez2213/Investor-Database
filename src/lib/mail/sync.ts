import { createHash } from "node:crypto";
import type { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { logActivities } from "../activity";
import { findSentMailbox, withImap } from "./imap";
import { findInvestorIdsByAddresses, findThread, insertEmail } from "./store";
import { autoRateInvestors, bouncedAddresses, isAutoReply, isBounce } from "./autoQuality";

/** Messages imported per folder per run; the next run continues where this one stopped. */
const MAX_MESSAGES_PER_RUN = 200;
/** On the very first sync only mail from the last N days is imported. */
const INITIAL_SYNC_DAYS = 30;

export type SyncResult = {
  imported: number;
  folders: { mailbox: string; imported: number; remaining: number }[];
  busy?: boolean;
};

type Direction = "inbound" | "outbound";

type ImportMeta = {
  companyId: string;
  direction: Direction;
  mailbox: string;
  uid: number;
  uidValidity: string;
  seen: boolean;
  internalDate?: Date;
};

/** Advisory lock id per company, so two syncs of the same mailbox never overlap. */
function lockKey(companyId: string): number {
  return createHash("sha256").update(`mail-sync:${companyId}`).digest().readInt32BE(0);
}

function addressList(value: AddressObject | AddressObject[] | undefined): { address: string; name: string }[] {
  const objects = Array.isArray(value) ? value : value ? [value] : [];
  return objects
    .flatMap((object) => object.value)
    .filter((entry) => entry.address)
    .map((entry) => ({ address: entry.address!.toLowerCase(), name: entry.name ?? "" }));
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Investors a bounce is about: addresses it reports as failed that belong to an
 * investor this company has actually emailed.
 */
async function bouncedInvestorIds(db: PoolClient, companyId: string, parsed: ParsedMail, ownAddresses: string[]): Promise<string[]> {
  const { addresses } = bouncedAddresses(parsed, ownAddresses);
  if (addresses.length === 0) return [];
  const result = await db.query<{ id: string }>(
    `SELECT DISTINCT i.id FROM investors i
     WHERE lower(i.email) = ANY($2::text[])
       AND EXISTS (SELECT 1 FROM emails e
                   WHERE e.company_id = $1 AND e.direction = 'outbound'
                     AND lower(i.email) = ANY(e.to_addresses || e.cc_addresses))`,
    [companyId, addresses]
  );
  return result.rows.map((row) => row.id);
}

async function importMessage(db: PoolClient, source: Buffer, meta: ImportMeta): Promise<boolean> {
  const parsed = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true });

  const from = addressList(parsed.from)[0] ?? { address: "unknown@unknown", name: "" };
  const to = addressList(parsed.to).map((entry) => entry.address);
  const cc = addressList(parsed.cc).map((entry) => entry.address);
  const messageId =
    parsed.messageId || `<imap-${meta.uidValidity}-${meta.uid}@${meta.mailbox.replace(/\W/g, "")}.local>`;
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : [];
  const inReplyTo = parsed.inReplyTo ?? null;
  const html = typeof parsed.html === "string" ? parsed.html : null;
  const text = parsed.text ?? (html ? htmlToText(html) : null);
  const occurredAt = parsed.date ?? meta.internalDate ?? new Date();

  const thread = await findThread(
    db,
    meta.companyId,
    [inReplyTo, ...references].filter((id): id is string => Boolean(id))
  );
  // A "delivery failed" notice belongs to the investors it bounced for, not the mail server that sent it.
  const bounceNotice = meta.direction === "inbound" && isBounce(parsed, from.address);
  const bounced = bounceNotice ? await bouncedInvestorIds(db, meta.companyId, parsed, [...to, ...cc]) : [];
  const counterparts = meta.direction === "inbound" ? [from.address] : [...to, ...cc];
  const investorIds = bounced.length > 0 ? [...bounced] : await findInvestorIdsByAddresses(db, counterparts);
  if (thread?.investorId && !investorIds.includes(thread.investorId)) {
    investorIds.unshift(thread.investorId);
  }

  const emailId = await insertEmail(db, {
    companyId: meta.companyId,
    investorId: investorIds[0] ?? null,
    direction: meta.direction,
    status: meta.direction === "inbound" ? "received" : "sent",
    fromAddress: from.address,
    fromName: from.name || null,
    to,
    cc,
    subject: parsed.subject ?? "",
    text,
    html,
    messageId,
    inReplyTo,
    threadId: thread?.threadId ?? messageId,
    sentBy: meta.direction === "outbound" ? "Mailbox" : null,
    mailbox: meta.mailbox,
    imapUid: meta.uid,
    isRead: meta.direction === "outbound" || meta.seen,
    occurredAt,
    inboundKind: bounceNotice ? "bounce" : meta.direction === "inbound" && isAutoReply(parsed) ? "auto_reply" : null,
  });
  // Already stored, e.g. a message sent from the portal that is now in the Sent folder.
  if (!emailId) return false;

  // Rate investors from what happened: bounced → Low, a real reply → High, mail sent from the mailbox → Medium.
  if (bounced.length > 0) {
    // The email that bounced: the latest one sent to each of these investors.
    await db.query(
      `UPDATE emails o SET bounced_at = $3
       WHERE o.id IN (
         SELECT DISTINCT ON (x.investor_id) x.id FROM emails x
         WHERE x.company_id = $1 AND x.investor_id = ANY($2::bigint[])
           AND x.direction = 'outbound' AND x.status = 'sent' AND x.occurred_at <= $3
         ORDER BY x.investor_id, x.occurred_at DESC)
       AND o.bounced_at IS NULL`,
      [meta.companyId, bounced, occurredAt]
    );
    await autoRateInvestors(db, {
      companyId: meta.companyId,
      investorIds: bounced,
      outcome: "bounced",
      emailId,
      reason: `An email to this investor bounced: "${parsed.subject ?? "Delivery failed"}".`,
    });
  } else if (meta.direction === "inbound" && !bounceNotice && !isAutoReply(parsed)) {
    await autoRateInvestors(db, {
      companyId: meta.companyId,
      investorIds,
      outcome: "replied",
      emailId,
      reason: `Replied: "${parsed.subject ?? ""}".`,
    });
  } else if (meta.direction === "outbound") {
    await autoRateInvestors(db, {
      companyId: meta.companyId,
      investorIds,
      outcome: "sent",
      emailId,
      reason: `Emailed from the mailbox: "${parsed.subject ?? ""}".`,
    });
  }

  await logActivities(
    db,
    investorIds.map((investorId) => ({
      investorId,
      companyId: meta.companyId,
      kind: meta.direction === "inbound" ? ("email_received" as const) : ("email_sent" as const),
      actor: meta.direction === "inbound" ? from.name || from.address : "Mailbox",
      emailId,
      createdAt: occurredAt,
    }))
  );
  return true;
}

async function syncFolder(
  imap: ImapFlow,
  db: PoolClient,
  companyId: string,
  path: string,
  direction: Direction
): Promise<{ mailbox: string; imported: number; remaining: number }> {
  const lock = await imap.getMailboxLock(path);
  try {
    const mailbox = imap.mailbox;
    if (!mailbox) return { mailbox: path, imported: 0, remaining: 0 };
    const uidValidity = String(mailbox.uidValidity);

    const state = await db.query<{ uid_validity: string; last_uid: string }>(
      "SELECT uid_validity, last_uid FROM email_sync_state WHERE company_id = $1 AND mailbox = $2",
      [companyId, path]
    );
    const known = state.rows[0]?.uid_validity === uidValidity;
    const lastUid = known ? Number(state.rows[0].last_uid) : 0;

    let uids: number[] = [];
    if (known) {
      if (mailbox.uidNext > lastUid + 1) {
        const found = await imap.search({ uid: `${lastUid + 1}:*` }, { uid: true });
        uids = (found || []).filter((uid) => uid > lastUid);
      }
    } else {
      const since = new Date(Date.now() - INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000);
      uids = (await imap.search({ since }, { uid: true })) || [];
    }
    uids.sort((a, b) => a - b);
    const batch = uids.slice(0, MAX_MESSAGES_PER_RUN);

    let imported = 0;
    let maxUid = lastUid;
    if (batch.length > 0) {
      for await (const message of imap.fetch(
        batch,
        { uid: true, source: true, flags: true, internalDate: true },
        { uid: true }
      )) {
        maxUid = Math.max(maxUid, message.uid);
        if (!message.source) continue;
        try {
          const added = await importMessage(db, message.source, {
            companyId,
            direction,
            mailbox: path,
            uid: message.uid,
            uidValidity,
            seen: message.flags?.has("\\Seen") ?? false,
            internalDate: message.internalDate instanceof Date ? message.internalDate : undefined,
          });
          if (added) imported += 1;
        } catch (error) {
          console.error(`Failed to import message ${message.uid} from ${path}:`, error);
        }
      }
    }

    const remaining = uids.length - batch.length;
    // Once caught up, jump to the newest UID so the next run only looks at new mail.
    const nextLastUid = remaining === 0 ? Math.max(maxUid, mailbox.uidNext - 1) : maxUid;
    await db.query(
      `INSERT INTO email_sync_state (company_id, mailbox, uid_validity, last_uid, last_synced_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (company_id, mailbox) DO UPDATE
         SET uid_validity = EXCLUDED.uid_validity, last_uid = EXCLUDED.last_uid, last_synced_at = now()`,
      [companyId, path, uidValidity, nextLastUid]
    );

    return { mailbox: path, imported, remaining };
  } finally {
    lock.release();
  }
}

/** Imports new mail from the company's Inbox and Sent folders and links it to investors. */
export async function syncMailboxes(companyId: string): Promise<SyncResult> {
  const db = await pool.connect();
  const key = lockKey(companyId);
  try {
    const lock = await db.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [key]);
    if (!lock.rows[0]?.ok) return { imported: 0, folders: [], busy: true };

    try {
      const folders = await withImap(companyId, async (imap) => {
        const results = [await syncFolder(imap, db, companyId, "INBOX", "inbound")];
        const sent = await findSentMailbox(imap);
        if (sent) results.push(await syncFolder(imap, db, companyId, sent, "outbound"));
        return results;
      });
      return { imported: folders.reduce((sum, folder) => sum + folder.imported, 0), folders };
    } finally {
      await db.query("SELECT pg_advisory_unlock($1)", [key]);
    }
  } finally {
    db.release();
  }
}
