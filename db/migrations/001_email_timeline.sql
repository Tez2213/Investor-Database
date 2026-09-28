-- Email (SMTP/IMAP), activity timeline, notes and tags for investors.
-- Additive only: safe to run more than once.

ALTER TABLE investors ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_investors_tags ON investors USING gin (tags);
-- Matches incoming/outgoing mail to investors by address.
CREATE INDEX IF NOT EXISTS idx_investors_email_lower ON investors (lower(email));

CREATE TABLE IF NOT EXISTS emails (
  id bigserial PRIMARY KEY,
  investor_id bigint REFERENCES investors(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'received')),
  from_address text NOT NULL,
  from_name text,
  to_addresses text[] NOT NULL DEFAULT '{}',
  cc_addresses text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL DEFAULT '',
  text_body text,
  html_body text,
  snippet text,
  message_id text NOT NULL UNIQUE,
  in_reply_to text,
  thread_id text NOT NULL,
  error text,
  sent_by text,
  mailbox text,
  imap_uid bigint,
  is_read boolean NOT NULL DEFAULT true,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emails_investor ON emails (investor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_occurred ON emails (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails (thread_id);

CREATE TABLE IF NOT EXISTS investor_activities (
  id bigserial PRIMARY KEY,
  investor_id bigint NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  -- comment | field_change | email_sent | email_failed | email_received | notes_updated | tags_updated
  kind text NOT NULL,
  actor text,
  body text,
  details jsonb NOT NULL DEFAULT '{}',
  email_id bigint REFERENCES emails(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_investor ON investor_activities (investor_id, created_at DESC, id DESC);

-- Where each IMAP folder sync left off.
CREATE TABLE IF NOT EXISTS email_sync_state (
  mailbox text PRIMARY KEY,
  uid_validity text NOT NULL,
  last_uid bigint NOT NULL DEFAULT 0,
  last_synced_at timestamptz
);
