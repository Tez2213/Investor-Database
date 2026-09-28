-- Email outcomes for the inbox numbers:
--   sent_by_user_id  which person sent an email from the portal (for "Mine" numbers)
--   bounced_at       a sent email later came back as "delivery failed"
--   inbound_kind     'bounce' / 'auto_reply' for incoming mail that isn't a real reply
-- Safe to run more than once.

ALTER TABLE emails ADD COLUMN IF NOT EXISTS sent_by_user_id bigint REFERENCES auth_users(id) ON DELETE SET NULL;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS bounced_at timestamptz;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS inbound_kind text;
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_inbound_kind_check;
ALTER TABLE emails ADD CONSTRAINT emails_inbound_kind_check CHECK (inbound_kind IN ('bounce', 'auto_reply'));
CREATE INDEX IF NOT EXISTS idx_emails_company_sender ON emails (company_id, sent_by_user_id, occurred_at DESC)
  WHERE sent_by_user_id IS NOT NULL;

-- Existing portal emails: match the stored sender name/email to the account in that company.
UPDATE emails e SET sent_by_user_id = u.id
FROM auth_users u
WHERE e.sent_by_user_id IS NULL AND e.direction = 'outbound' AND e.sent_by IS NOT NULL
  AND u.company_id = e.company_id
  AND (lower(e.sent_by) = lower(u.email) OR lower(e.sent_by) = lower(u.name))
  AND NOT EXISTS (  -- skip names shared by two accounts
    SELECT 1 FROM auth_users other
    WHERE other.company_id = u.company_id AND other.id <> u.id
      AND (lower(e.sent_by) = lower(other.email) OR lower(e.sent_by) = lower(other.name)));

-- Existing incoming mail: flag bounce notices and automatic replies.
UPDATE emails SET inbound_kind = 'bounce'
WHERE direction = 'inbound' AND inbound_kind IS NULL
  AND (from_address ~* '^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@'
       OR subject ~* '(undeliver|delivery status notification \(failure\)|delivery (has )?failed|failure notice|returned mail|mail delivery (failed|subsystem)|could not be delivered|address not found|message not delivered)')
  AND subject !~* '(delay|will retry|still trying)';
UPDATE emails SET inbound_kind = 'auto_reply'
WHERE direction = 'inbound' AND inbound_kind IS NULL
  AND subject ~* '(out of (the )?office|automatic reply|auto.?reply|autoreply|auto-response|away from (the )?office)';

-- Existing bounces: mark the latest email sent to that investor before the bounce.
UPDATE emails o SET bounced_at = b.occurred_at
FROM emails b
WHERE b.direction = 'inbound' AND b.inbound_kind = 'bounce' AND b.investor_id IS NOT NULL
  AND o.bounced_at IS NULL
  AND o.id = (
    SELECT x.id FROM emails x
    WHERE x.company_id = b.company_id AND x.investor_id = b.investor_id
      AND x.direction = 'outbound' AND x.status = 'sent' AND x.occurred_at <= b.occurred_at
    ORDER BY x.occurred_at DESC LIMIT 1);
