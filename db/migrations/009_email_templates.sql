-- Saved email templates ("quick replies"): each person keeps their own subject
-- and body snippets to drop into the composer. Private to the person who saved them.

CREATE TABLE IF NOT EXISTS email_templates (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Saving under an existing name (any capitalisation) updates that template.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_user_name ON email_templates (user_id, lower(name));
