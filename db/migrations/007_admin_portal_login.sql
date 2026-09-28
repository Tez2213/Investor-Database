-- The admin portal has its own sign-in, separate from employee logins.
-- A super admin account (e.g. "admin@all") can only open the admin portal,
-- and admin-portal sessions can never be used as workspace sessions.

ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'user';
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_kind_check;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_kind_check CHECK (kind IN ('user', 'admin'));
