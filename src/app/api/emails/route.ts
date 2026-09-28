import { NextRequest, NextResponse, after } from "next/server";
import { pool } from "../../../lib/db";
import { auditLater } from "../../../lib/audit";
import { actorName, requireSession } from "../../../lib/auth/session";
import { NOT_ASSIGNED_ERROR, accessibleInvestorIds, investorAccessCondition, isRestricted } from "../../../lib/access";
import { logActivities, withTransaction } from "../../../lib/activity";
import { emailSummaryColumns } from "../../../lib/emailColumns";
import { parseId } from "../../../lib/parseId";
import { appendToSent } from "../../../lib/mail/imap";
import { isSmtpConfigured, sendEmail } from "../../../lib/mail/send";
import { findInvestorIdsByAddresses, insertEmail } from "../../../lib/mail/store";
import { cleanAddressList, renderTemplate, textToHtml } from "../../../lib/mail/text";
import { newOpenToken, publicBaseUrl, withOpenPixel } from "../../../lib/mail/tracking";
import type { EmailSummary } from "../../../lib/types";

const PAGE_SIZE = 50;
const MAX_RECIPIENTS = 20;
const MAX_SUBJECT_LENGTH = 300;
const MAX_BODY_LENGTH = 50_000;

const FOLDER_CONDITIONS: Record<string, string> = {
  all: "TRUE",
  inbox: "e.direction = 'inbound'",
  sent: "e.direction = 'outbound' AND e.status = 'sent'",
  failed: "e.status = 'failed'",
  unread: "e.direction = 'inbound' AND NOT e.is_read",
  unmatched: "e.investor_id IS NULL",
};

/** This company's emails for the Inbox page. Cursor is "<occurred_at ISO>|<id>". */
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;

  const params = request.nextUrl.searchParams;
  const folder = params.get("folder") ?? "all";
  const folderCondition = FOLDER_CONDITIONS[folder];
  if (!folderCondition) {
    return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
  }

  const values: unknown[] = [session.companyId];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const conditions = ["e.company_id = $1", folderCondition];

  // Members limited to assigned investors only see mail linked to those investors.
  const access = investorAccessCondition(session, "e.investor_id", param);
  if (access) conditions.push(access);

  const search = params.get("search")?.trim();
  if (search) {
    const like = param(`%${search}%`);
    conditions.push(
      `(e.subject ILIKE ${like} OR e.from_address ILIKE ${like} OR array_to_string(e.to_addresses, ' ') ILIKE ${like} OR e.snippet ILIKE ${like})`
    );
  }

  const cursor = params.get("cursor");
  if (cursor) {
    const [occurredAt, cursorId] = cursor.split("|");
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt)) || parseId(cursorId) === null) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    conditions.push(`(e.occurred_at, e.id) < (${param(occurredAt)}::timestamptz, ${param(cursorId)}::bigint)`);
  }

  try {
    const result = await pool.query<EmailSummary>(
      `SELECT ${emailSummaryColumns("e")},
              nullif(trim(concat_ws(' ', i.first_name, i.last_name)), '') AS investor_name
       FROM emails e
       LEFT JOIN investors i ON i.id = e.investor_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY e.occurred_at DESC, e.id DESC
       LIMIT ${param(PAGE_SIZE + 1)}`,
      values
    );
    const rows = result.rows.slice(0, PAGE_SIZE);
    const last = rows[rows.length - 1];
    return NextResponse.json({
      data: rows,
      nextCursor:
        result.rows.length > PAGE_SIZE && last ? `${new Date(last.occurred_at).toISOString()}|${last.id}` : null,
    });
  } catch (error) {
    console.error("Email list API error:", error);
    return NextResponse.json({ error: "Failed to load emails" }, { status: 500 });
  }
}

/** Sends an email from this company's mailbox, stores it, and adds it to the investor timelines. */
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (session instanceof NextResponse) return session;
  const companyId = session.companyId;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const to = cleanAddressList(body.to, MAX_RECIPIENTS);
  const cc = cleanAddressList(body.cc, MAX_RECIPIENTS);
  if (!to || to.length === 0) {
    return NextResponse.json({ error: "Add at least one valid recipient" }, { status: 400 });
  }
  if (!cc) {
    return NextResponse.json({ error: "One of the Cc addresses is not valid" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (subject.length > MAX_SUBJECT_LENGTH || text.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: "Subject or message is too long" }, { status: 400 });
  }

  const hasInvestorId = body.investorId != null && body.investorId !== "";
  const investorId = hasInvestorId ? parseId(body.investorId) : null;
  if (hasInvestorId && investorId === null) {
    return NextResponse.json({ error: "Invalid investor id" }, { status: 400 });
  }
  const replyToId = body.replyToEmailId == null ? null : parseId(body.replyToEmailId);

  const actor = actorName(session);

  try {
    const investor = investorId
      ? (
          await pool.query<{ first_name: string | null; last_name: string | null; company_name: string | null }>(
            "SELECT first_name, last_name, company_name FROM investors WHERE id = $1",
            [investorId]
          )
        ).rows[0]
      : null;
    if (investorId && !investor) {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }

    const parent = replyToId
      ? (
          await pool.query<{ message_id: string; thread_id: string; investor_id: string | null }>(
            "SELECT message_id, thread_id, investor_id FROM emails WHERE id = $1 AND company_id = $2",
            [replyToId, companyId]
          )
        ).rows[0] ?? null
      : null;
    if (replyToId && !parent) {
      return NextResponse.json({ error: "The email you're replying to was not found" }, { status: 404 });
    }

    // Members limited to assigned investors can only email (and reply to) those investors.
    if (isRestricted(session)) {
      const matchedRecipients = await findInvestorIdsByAddresses(pool, [...to, ...cc]);
      const involved = [investorId, parent?.investor_id, ...matchedRecipients].filter(
        (value): value is string | number => value != null
      );
      if (involved.length === 0) {
        return NextResponse.json(
          { error: "You can only email investors assigned to you. Open the investor's page and send from there.", code: "not_assigned" },
          { status: 403 }
        );
      }
      const allowed = await accessibleInvestorIds(pool, session, involved);
      if (involved.some((value) => !allowed.has(String(value)))) {
        return NextResponse.json({ error: NOT_ASSIGNED_ERROR, code: "not_assigned" }, { status: 403 });
      }
    }

    if (!isSmtpConfigured(companyId)) {
      return NextResponse.json(
        { error: "Your company's mailbox isn't connected yet. Ask your admin to add it.", code: "not_configured" },
        { status: 503 }
      );
    }

    const renderedSubject = renderTemplate(subject, investor ?? null);
    const renderedText = renderTemplate(text, investor ?? null);
    const html = textToHtml(renderedText);
    // The recipient's copy carries an invisible image that reports when it is
    // opened; the copy stored here stays clean so viewing it never counts.
    const baseUrl = publicBaseUrl(request);
    const openToken = baseUrl ? newOpenToken() : null;

    const sent = await sendEmail(companyId, {
      to,
      cc,
      subject: renderedSubject,
      text: renderedText,
      html: baseUrl && openToken ? withOpenPixel(html, baseUrl, openToken) : html,
      inReplyTo: parent?.message_id ?? null,
      references: parent ? Array.from(new Set([parent.thread_id, parent.message_id])) : [],
    });

    const email = await withTransaction(pool, async (client) => {
      const matched = await findInvestorIdsByAddresses(client, [...to, ...cc]);
      const investorIds = Array.from(
        new Set(
          [investorId ? String(investorId) : null, parent?.investor_id ?? null, ...matched].filter(
            (id): id is string => Boolean(id)
          )
        )
      );

      const emailId = await insertEmail(client, {
        companyId,
        investorId: investorIds[0] ?? null,
        direction: "outbound",
        status: sent.error ? "failed" : "sent",
        fromAddress: sent.fromAddress,
        fromName: sent.fromName,
        to,
        cc,
        subject: renderedSubject,
        text: renderedText,
        html,
        messageId: sent.messageId,
        inReplyTo: parent?.message_id ?? null,
        threadId: parent?.thread_id ?? sent.messageId,
        error: sent.error,
        sentBy: actor,
        isRead: true,
        occurredAt: new Date(),
        openToken: sent.error ? null : openToken,
      });

      await logActivities(
        client,
        investorIds.map((id) => ({
          investorId: id,
          companyId,
          kind: sent.error ? ("email_failed" as const) : ("email_sent" as const),
          actor,
          emailId,
        }))
      );
      return { id: emailId, investorIds };
    });

    auditLater(request, session, {
      action: sent.error ? "email_failed" : "email_sent",
      investorId: email.investorIds[0] ?? null,
      details: { to, cc, subject: renderedSubject, emailId: email.id, error: sent.error },
    });

    if (sent.error) {
      return NextResponse.json({ error: `The mail server did not accept the email: ${sent.error}`, data: email }, { status: 502 });
    }

    // Keep a copy in the mailbox's Sent folder without making the user wait.
    after(async () => {
      const problem = await appendToSent(companyId, sent.raw);
      if (problem) console.warn("Could not save sent email to IMAP Sent folder:", problem);
    });

    return NextResponse.json({ data: email }, { status: 201 });
  } catch (error) {
    console.error("Send email API error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
