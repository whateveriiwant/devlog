CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL,
  published_at TEXT NOT NULL,
  updated_at TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  series_id TEXT,
  thumbnail TEXT,
  draft INTEGER NOT NULL DEFAULT 1 CHECK (draft IN (0, 1)),
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  source_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS posts_public_latest
  ON posts(draft, deleted_at, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS posts_series_latest
  ON posts(series_id, published_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  original_url TEXT
);

CREATE TABLE IF NOT EXISTS post_images (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  PRIMARY KEY (post_id, r2_key)
);
CREATE INDEX IF NOT EXISTS post_images_key ON post_images(r2_key);

CREATE TABLE IF NOT EXISTS publish_requests (
  request_id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
