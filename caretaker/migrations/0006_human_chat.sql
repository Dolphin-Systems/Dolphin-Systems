-- 0006: human chat handoff + push subscriptions
CREATE TABLE IF NOT EXISTS human_chats (
  conversation_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_notified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_human_chats_status ON human_chats(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
