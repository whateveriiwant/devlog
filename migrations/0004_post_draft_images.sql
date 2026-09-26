CREATE TABLE IF NOT EXISTS post_draft_images (
  post_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  PRIMARY KEY (post_id, r2_key)
);
CREATE INDEX IF NOT EXISTS post_draft_images_key ON post_draft_images(r2_key);
