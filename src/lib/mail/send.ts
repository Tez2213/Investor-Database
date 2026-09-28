import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { getCompanyMailConfig, type ServerConfig } from "./config";

type SmtpTransport = ReturnType<typeof createSmtpTransport>;

const globalForMail = globalThis as unknown as {
  smtpTransports?: Map<string, SmtpTransport>;
};

function createSmtpTransport(config: ServerConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

/** One reusable SMTP connection setup per mailbox. */
function getSmtpTransport(config: ServerConfig): SmtpTransport {
  globalForMail.smtpTransports ??= new Map();
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}:${config.pass.length}`;
  let transport = globalForMail.smtpTransports.get(key);
  if (!transport) {
    transport = createSmtpTransport(config);
    globalForMail.smtpTransports.set(key, transport);
  }
  return transport;
}

// Builds the MIME message without sending it, so the exact bytes can be both
// sent over SMTP and saved into the IMAP Sent folder.
const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });

export type OutgoingEmail = {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string | null;
  references?: string[];
};

export type SendResult = {
  messageId: string;
  fromAddress: string;
  fromName: string | null;
  raw: Buffer;
  /** Set when the SMTP server rejected the message or could not be reached. */
  error: string | null;
  /** Recipients the mail server permanently refused (e.g. "550 no such user"). */
  rejectedRecipients: string[];
};

/** Addresses from a nodemailer result or error that were refused permanently (5xx), not temporarily. */
function permanentlyRejected(value: unknown): string[] {
  const source = value as { rejected?: unknown[]; rejectedErrors?: { recipient?: string; responseCode?: number }[] } | null;
  if (!source) return [];
  const errors = source.rejectedErrors ?? [];
  if (errors.length > 0) {
    return errors
      .filter((error) => (error.responseCode ?? 0) >= 500 && error.recipient)
      .map((error) => error.recipient!.toLowerCase());
  }
  const code = (value as { responseCode?: number }).responseCode ?? 0;
  if (code < 500) return [];
  return (source.rejected ?? [])
    .map((entry) => (typeof entry === "string" ? entry : (entry as { address?: string })?.address ?? ""))
    .filter(Boolean)
    .map((address) => address.toLowerCase());
}

/** Turns SMTP failures into something a user can act on. */
function describeSendError(sendError: unknown): string {
  const code = (sendError as { code?: string } | null)?.code;
  if (code === "EAUTH") {
    return "The mail server rejected the mailbox login. Check the mailbox password in the environment settings.";
  }
  if (code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET" || code === "EDNS") {
    return "Could not reach the mail server. Please try again in a moment.";
  }
  return sendError instanceof Error ? sendError.message : "Failed to send email";
}

export function isSmtpConfigured(companyId: string): boolean {
  return getCompanyMailConfig(companyId).smtp !== null;
}

export async function sendEmail(companyId: string, email: OutgoingEmail): Promise<SendResult> {
  const { smtp, sender } = getCompanyMailConfig(companyId);
  if (!smtp || !sender.address) {
    throw new Error("Email sending is not configured for this company");
  }

  const domain = sender.address.split("@")[1] ?? "localhost";
  const messageId = `<${randomUUID()}@${domain}>`;

  const built = await composer.sendMail({
    from: sender.name ? { name: sender.name, address: sender.address } : sender.address,
    to: email.to,
    cc: email.cc.length > 0 ? email.cc : undefined,
    subject: email.subject,
    text: email.text,
    html: email.html,
    messageId,
    inReplyTo: email.inReplyTo ?? undefined,
    references: email.references && email.references.length > 0 ? email.references : undefined,
    date: new Date(),
  });
  const raw = built.message as Buffer;

  let error: string | null = null;
  let rejectedRecipients: string[] = [];
  try {
    const info = await getSmtpTransport(smtp).sendMail({
      envelope: { from: sender.address, to: [...email.to, ...email.cc] },
      raw,
    });
    // Delivered to some recipients but refused for others.
    rejectedRecipients = permanentlyRejected(info);
  } catch (sendError) {
    error = describeSendError(sendError);
    if ((sendError as { code?: string } | null)?.code === "EENVELOPE") rejectedRecipients = permanentlyRejected(sendError);
  }

  return { messageId, fromAddress: sender.address, fromName: sender.name, raw, error, rejectedRecipients };
}
