-- Durable checkpoint for the historical body cache worker.
-- A NULL value means the row still needs a body attempt; failed IMAP batches leave it NULL
-- so the scheduler can retry, while successfully fetched or empty messages advance once.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS body_attempted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_body_backfill
  ON messages (account_id, folder, date DESC)
  WHERE body_html IS NULL AND body_text IS NULL AND body_attempted_at IS NULL;
