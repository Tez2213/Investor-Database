-- Company-wide audit trail for the admin portal: who did what, when, from where.
-- (Per-investor history for each company lives in investor_activities.)

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id bigint REFERENCES auth_users(id) ON DELETE SET NULL,
  user_email text,
  company_id text,
  action text NOT NULL,
  investor_id bigint,
  details jsonb NOT NULL DEFAULT '{}',
  ip text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action, created_at DESC);
