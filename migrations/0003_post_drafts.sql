CREATE TABLE IF NOT EXISTS post_drafts (
  post_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  series_id TEXT,
  series_json TEXT,
  thumbnail TEXT,
  base_revision INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  request_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_write_requests (
  request_id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  created_at TEXT NOT NULL
);
