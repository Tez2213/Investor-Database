import { ImapFlow } from "imapflow";
import { getCompanyMailConfig } from "./config";

/** Opens an IMAP connection to the company's mailbox, runs fn, and always logs out. */
export async function withImap<T>(companyId: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const { imap } = getCompanyMailConfig(companyId);
  if (!imap) throw new Error("Inbox (IMAP) is not configured for this company");

  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
    disableAutoIdle: true,
  });

  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Path of the folder holding sent mail ("Sent", "Sent Items", ...). */
export async function findSentMailbox(client: ImapFlow): Promise<string | null> {
  const mailboxes = await client.list();
  const bySpecialUse = mailboxes.find((mailbox) => mailbox.specialUse === "\\Sent");
  if (bySpecialUse) return bySpecialUse.path;
  const byName = mailboxes.find((mailbox) => /^(sent|sent items|sent messages|sent mail)$/i.test(mailbox.name));
  return byName?.path ?? null;
}

/**
 * Saves a copy of a message sent over SMTP into the Sent folder, so it also
 * shows in webmail. Best effort: returns an error message instead of throwing.
 */
export async function appendToSent(companyId: string, raw: Buffer): Promise<string | null> {
  if (!getCompanyMailConfig(companyId).imap) return null;
  try {
    await withImap(companyId, async (client) => {
      const sent = (await findSentMailbox(client)) ?? "Sent";
      await client.append(sent, raw, ["\\Seen"]);
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not save to Sent folder";
  }
}
