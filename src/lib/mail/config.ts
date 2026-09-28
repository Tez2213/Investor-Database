import { companyById } from "../companies";

/**
 * Each company connects its own mailbox through environment variables
 * (see .env.example), e.g. FABRICVTON_MAIL_USER / FABRICVTON_MAIL_PASS.
 * Servers default to Titan Mail (GoDaddy): smtp.titan.email:465 and imap.titan.email:993.
 */

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

function secureFlag(value: string | undefined, port: number, securePort: number): boolean {
  return value ? value !== "false" : port === securePort;
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

  const smtpPort = envNumber(process.env.SMTP_PORT, 465);
  const imapPort = envNumber(process.env.IMAP_PORT, 993);
  return {
    smtp: {
      host: process.env.SMTP_HOST?.trim() || "smtp.titan.email",
      port: smtpPort,
      secure: secureFlag(process.env.SMTP_SECURE, smtpPort, 465),
      user,
      pass,
    },
    imap: {
      host: process.env.IMAP_HOST?.trim() || "imap.titan.email",
      port: imapPort,
      secure: secureFlag(process.env.IMAP_SECURE, imapPort, 993),
      user,
      pass,
    },
    sender: { address: user.toLowerCase(), name },
  };
}
