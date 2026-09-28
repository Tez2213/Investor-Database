-- Investor assignments: the admin portal can limit a member to the investors
-- assigned to them. Members in 'assigned' mode only see, edit and email those
-- investors; 'all' (the default) keeps today's behaviour. Admins always see all.

ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'all';
ALTER TABLE auth_users DROP CONSTRAINT IF EXISTS auth_users_access_mode_check;
ALTER TABLE auth_users ADD CONSTRAINT auth_users_access_mode_check CHECK (access_mode IN ('all', 'assigned'));

-- One row per "assign" action (a range, a filter, a hand-picked list…), so an
-- admin can see where assignments came from and undo a whole batch at once.
CREATE TABLE IF NOT EXISTS assignment_batches (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  description text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '{}',
  added_count integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignment_batches_user ON assignment_batches (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_investor_assignments (
  user_id bigint NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  investor_id bigint NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  batch_id bigint REFERENCES assignment_batches(id) ON DELETE SET NULL,
  assigned_by text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, investor_id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_investor ON user_investor_assignments (investor_id);
CREATE INDEX IF NOT EXISTS idx_assignments_batch ON user_investor_assignments (batch_id);
