import type { EmailMessage } from "../../lib/types";
import { formatDateTime } from "../../lib/format";

export type ComposerDefaults = {
  to: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  replyToEmailId?: string | null;
};

const MAX_QUOTE_LENGTH = 4000;

/** Pre-fills a reply: recipient, "Re:" subject and the quoted original message. */
export function buildReplyDefaults(email: EmailMessage): ComposerDefaults {
  const to = email.direction === "inbound" ? [email.from_address] : email.to_addresses;
  const subject = /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`;
  const original = (email.text_body ?? email.snippet ?? "").slice(0, MAX_QUOTE_LENGTH);
  const quoted = original
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const sender = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;
  return {
    to,
    subject,
    body: `\n\nOn ${formatDateTime(email.occurred_at)}, ${sender} wrote:\n${quoted}`,
    replyToEmailId: email.id,
  };
}
