-- Open tracking for emails sent from the portal.
-- Each sent email carries a 1x1 image whose URL contains open_token; loading it
-- records an open. Existing emails keep open_token NULL ("not tracked").

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS open_token text,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_open_token ON emails (open_token) WHERE open_token IS NOT NULL;

-- Inbox stats: outbound/inbound counts per company over a period.
CREATE INDEX IF NOT EXISTS idx_emails_company_direction_time ON emails (company_id, direction, occurred_at DESC);

-- Speeds up "is this IP one of our own team?" when filtering self-opens.
CREATE INDEX IF NOT EXISTS idx_audit_log_company_ip ON audit_log (company_id, ip, created_at DESC) WHERE ip IS NOT NULL;
