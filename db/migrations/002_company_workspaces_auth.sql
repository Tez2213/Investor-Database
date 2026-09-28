-- Separate workspaces per company (fabricvton, beatband, naaradh) and email-code login.
-- The investor list is shared; ratings, notes, tags, timeline and mail belong to one company.
-- Written for the empty tables created by 001 (no data is moved).

-- Per-company view of an investor.
CREATE TABLE IF NOT EXISTS investor_company_data (
  investor_id bigint NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  company_id text NOT NULL,
  quality text,
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (investor_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_company_data_company_quality ON investor_company_data (company_id, quality);
CREATE INDEX IF NOT EXISTS idx_company_data_tags ON investor_company_data USING gin (tags);

-- notes/tags moved to investor_company_data (these columns were empty).
DROP INDEX IF EXISTS idx_investors_tags;
ALTER TABLE investors DROP COLUMN IF EXISTS notes;
ALTER TABLE investors DROP COLUMN IF EXISTS tags;

-- Timeline entries belong to the company that made them.
ALTER TABLE investor_activities ADD COLUMN IF NOT EXISTS company_id text NOT NULL;
DROP INDEX IF EXISTS idx_activities_investor;
CREATE INDEX IF NOT EXISTS idx_activities_company_investor
  ON investor_activities (company_id, investor_id, created_at DESC, id DESC);

-- Each company has its own mailbox.
ALTER TABLE emails ADD COLUMN IF NOT EXISTS company_id text NOT NULL;
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_message_id_key;
ALTER TABLE emails ADD CONSTRAINT emails_company_message_id_key UNIQUE (company_id, message_id);
DROP INDEX IF EXISTS idx_emails_occurred;
DROP INDEX IF EXISTS idx_emails_thread;
CREATE INDEX IF NOT EXISTS idx_emails_company_occurred ON emails (company_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_emails_company_thread ON emails (company_id, thread_id);

ALTER TABLE email_sync_state ADD COLUMN IF NOT EXISTS company_id text NOT NULL;
ALTER TABLE email_sync_state DROP CONSTRAINT IF EXISTS email_sync_state_pkey;
ALTER TABLE email_sync_state ADD PRIMARY KEY (company_id, mailbox);

-- Login: people with a company email sign in with a one-time code.
CREATE TABLE IF NOT EXISTS auth_users (
  id bigserial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  company_id text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth_login_codes (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_codes_email ON auth_login_codes (email, created_at DESC);
