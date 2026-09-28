-- Admin-managed accounts: admins create employee logins (company email + password)
-- and each account opens its own company's workspace. Replaces email-code login.

DROP TABLE IF EXISTS auth_login_codes;

ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password_hash text NOT NULL;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE auth_users DROP CONSTRAINT IF EXISTS auth_users_role_check;
ALTER TABLE auth_users ADD CONSTRAINT auth_users_role_check CHECK (role IN ('admin', 'member'));

-- Server-side sessions so an admin can sign someone out by deactivating them.
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  -- Workspace being viewed; admins can switch, members stay on their own company.
  company_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions (user_id);
