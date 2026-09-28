-- Which recipients of a sent email bounced (one bad Cc shouldn't block the main
-- recipient), used to warn before emailing an address that failed before.
-- Plus indexes for recipient lookups. Safe to run more than once.

ALTER TABLE emails ADD COLUMN IF NOT EXISTS bounced_addresses text[] NOT NULL DEFAULT '{}';

-- Emails already marked as bounced: the investor they were linked to is the one that bounced.
UPDATE emails e SET bounced_addresses = ARRAY[lower(i.email)]
FROM investors i
WHERE e.bounced_at IS NOT NULL AND e.bounced_addresses = '{}' AND i.id = e.investor_id AND i.email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emails_bounced_addresses ON emails USING gin (bounced_addresses) WHERE bounced_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_to_addresses ON emails USING gin (to_addresses);

-- idx_investors_email_lower duplicates idx_investors_email (both on lower(email));
-- keeping both only slows down writes. Drop it only when the other one exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_investors_email') THEN
    DROP INDEX IF EXISTS idx_investors_email_lower;
  END IF;
END $$;
