-- Leads uploaded by a company join the shared list for everyone, watermarked with
-- the company that added them. Original rows have source_company_id = NULL.

CREATE TABLE IF NOT EXISTS lead_imports (
  id bigserial PRIMARY KEY,
  company_id text NOT NULL,
  user_id bigint REFERENCES auth_users(id) ON DELETE SET NULL,
  user_email text,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  invalid integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE investors ADD COLUMN IF NOT EXISTS source_company_id text;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS uploaded_by bigint REFERENCES auth_users(id) ON DELETE SET NULL;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;
ALTER TABLE investors ADD COLUMN IF NOT EXISTS import_id bigint REFERENCES lead_imports(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_investors_source_company ON investors (source_company_id) WHERE source_company_id IS NOT NULL;
