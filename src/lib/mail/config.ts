import { companyById } from "../companies";

/**
 * Each company connects its own mailbox through environment variables
 * (see .env.example), e.g. FABRICVTON_MAIL_USER / FABRICVTON_MAIL_PASS.
 * Servers default to GoDaddy Professional Email (smtpout.secureserver.net:465 and
 * imap.secureserver.net:993), which hosts all three company domains. Override them
 * for every company with SMTP_HOST / IMAP_HOST, or for one company with e.g.
 * FABRICVTON_SMTP_HOST, if a mailbox moves to another provider.
 */

const DEFAULT_SMTP_HOST = "smtpout.secureserver.net";
const DEFAULT_IMAP_HOST = "imap.secureserver.net";
/**
 * Stay well under the mailbox provider's daily cap: going over it gets the
 * mailbox blocked for a day and hurts how often mail lands in the inbox.
 */
const DEFAULT_DAILY_SEND_LIMIT = 300;

export type ServerConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

export type CompanyMailConfig = {
  smtp: ServerConfig | null;
  imap: ServerConfig | null;
  sender: { address: string | null; name: string | null };
};

function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** A per-company value such as FABRICVTON_SMTP_HOST wins over the shared SMTP_HOST. */
function setting(prefix: string, name: string): string | undefined {
  return process.env[`${prefix}_${name}`]?.trim() || process.env[name]?.trim() || undefined;
}

function secureFlag(value: string | undefined, port: number, securePort: number): boolean {
  return value ? value !== "false" : port === securePort;
}

/** Most recipients a company's mailbox may send to in 24 hours (COMPANY_DAILY_SEND_LIMIT or DAILY_SEND_LIMIT). */
export function dailySendLimit(companyId: string): number {
  const company = companyById(companyId);
  return envNumber(company ? setting(company.id.toUpperCase(), "DAILY_SEND_LIMIT") : undefined, DEFAULT_DAILY_SEND_LIMIT);
}

export function getCompanyMailConfig(companyId: string): CompanyMailConfig {
  const company = companyById(companyId);
  const prefix = company ? company.id.toUpperCase() : "";
  const user = prefix ? process.env[`${prefix}_MAIL_USER`]?.trim() : undefined;
  const pass = prefix ? process.env[`${prefix}_MAIL_PASS`] : undefined;
  const name = (prefix && process.env[`${prefix}_MAIL_FROM_NAME`]?.trim()) || company?.name || null;

  if (!user || !pass) {
    return { smtp: null, imap: null, sender: { address: user || null, name } };
  }

  const smtpPort = envNumber(setting(prefix, "SMTP_PORT"), 465);
  const imapPort = envNumber(setting(prefix, "IMAP_PORT"), 993);
  return {
    smtp: {
      host: setting(prefix, "SMTP_HOST") ?? DEFAULT_SMTP_HOST,
      port: smtpPort,
      secure: secureFlag(setting(prefix, "SMTP_SECURE"), smtpPort, 465),
      user,
      pass,
    },
    imap: {
      host: setting(prefix, "IMAP_HOST") ?? DEFAULT_IMAP_HOST,
      port: imapPort,
      secure: secureFlag(setting(prefix, "IMAP_SECURE"), imapPort, 993),
      user,
      pass,
    },
    sender: { address: user.toLowerCase(), name },
  };
}
