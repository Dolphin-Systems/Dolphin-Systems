CREATE TABLE IF NOT EXISTS blog_comments (
  id TEXT PRIMARY KEY,
  post_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_blog_comments_slug ON blog_comments(post_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS blog_reactions (
  post_slug TEXT NOT NULL,
  reaction TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_slug, reaction)
);
