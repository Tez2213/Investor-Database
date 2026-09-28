import type { PoolClient } from "pg";
import type { EmailDirection, EmailStatus } from "../types";
import { makeSnippet, truncate } from "./text";

type Queryable = Pick<PoolClient, "query">;

const MAX_TEXT_BODY = 200_000;
const MAX_HTML_BODY = 500_000;
/** Cap on investors linked to one message (e.g. a mail sent to a big list). */
const MAX_LINKED_INVESTORS = 25;

export type NewEmail = {
  companyId: string;
  investorId: number | string | null;
  direction: EmailDirection;
  status: EmailStatus;
  fromAddress: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string;
  inReplyTo: string | null;
  threadId: string;
  error?: string | null;
  sentBy?: string | null;
  mailbox?: string | null;
  imapUid?: number | null;
  isRead: boolean;
  occurredAt: Date;
  /** Set on emails sent from the portal with an open-tracking image. */
  openToken?: string | null;
};

/** Inserts an email; returns its id, or null if this company already has that Message-ID. */
export async function insertEmail(db: Queryable, email: NewEmail): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO emails (investor_id, direction, status, from_address, from_name, to_addresses, cc_addresses,
                         subject, text_body, html_body, snippet, message_id, in_reply_to, thread_id, error,
                         sent_by, mailbox, imap_uid, is_read, occurred_at, company_id, open_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
     ON CONFLICT (company_id, message_id) DO NOTHING
     RETURNING id`,
    [
      email.investorId,
      email.direction,
      email.status,
      email.fromAddress.toLowerCase(),
      email.fromName,
      email.to,
      email.cc,
      truncate(email.subject, 1000) ?? "",
      truncate(email.text, MAX_TEXT_BODY),
      truncate(email.html, MAX_HTML_BODY),
      makeSnippet(email.text),
      email.messageId,
      email.inReplyTo,
      email.threadId,
      email.error ?? null,
      email.sentBy ?? null,
      email.mailbox ?? null,
      email.imapUid ?? null,
      email.isRead,
      email.occurredAt,
      email.companyId,
      email.openToken ?? null,
    ]
  );
  return result.rows[0]?.id ?? null;
}

/** Investor ids whose email address is one of the given addresses. */
export async function findInvestorIdsByAddresses(db: Queryable, addresses: string[]): Promise<string[]> {
  const unique = Array.from(new Set(addresses.map((address) => address.toLowerCase()).filter(Boolean)));
  if (unique.length === 0) return [];
  const result = await db.query<{ id: string }>(
    "SELECT id FROM investors WHERE lower(email) = ANY($1::text[]) ORDER BY id LIMIT $2",
    [unique, MAX_LINKED_INVESTORS]
  );
  return result.rows.map((row) => row.id);
}

/** Finds the conversation a message belongs to from its In-Reply-To / References headers. */
export async function findThread(
  db: Queryable,
  companyId: string,
  referencedIds: string[]
): Promise<{ threadId: string; investorId: string | null } | null> {
  const ids = referencedIds.filter(Boolean);
  if (ids.length === 0) return null;
  const result = await db.query<{ thread_id: string; investor_id: string | null }>(
    `SELECT thread_id, investor_id FROM emails
     WHERE company_id = $1 AND message_id = ANY($2::text[])
     ORDER BY occurred_at DESC LIMIT 1`,
    [companyId, ids]
  );
  const row = result.rows[0];
  return row ? { threadId: row.thread_id, investorId: row.investor_id } : null;
}
