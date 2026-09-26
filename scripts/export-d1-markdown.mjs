import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { DatabaseSync } from 'node:sqlite';
import YAML from 'yaml';

// Export an offline Wrangler SQL backup; never overwrite the current repository.
const [backup, destination] = process.argv.slice(2);
if (!backup || !destination)
  throw new Error(
    'Usage: node scripts/export-d1-markdown.mjs backup.sql empty-output-directory'
  );
const output = path.resolve(destination);
if (fs.existsSync(output)) throw new Error('Output directory already exists');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(backup, 'utf8'));
const posts = db.prepare('SELECT * FROM posts ORDER BY id').all();
const drafts = db.prepare('SELECT * FROM post_drafts ORDER BY post_id').all();
const series = db.prepare('SELECT * FROM series ORDER BY id').all();
const source = path.join(output, 'src/content');
fs.mkdirSync(path.join(source, 'posts'), { recursive: true });
fs.mkdirSync(path.join(output, 'drafts'), { recursive: true });

function writePost(row, directory, draft) {
  const id = row.id || row.post_id;
  if (!/^[\w.-]{1,120}$/.test(id) || id === '.' || id === '..')
    throw new Error('Invalid post ID in backup');
  const metadata = {
    title: row.title,
    description: row.description,
    slug: row.slug,
    publishedAt: row.published_at || row.updated_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    tags: JSON.parse(row.tags_json),
    ...(row.series_id ? { series: { id: row.series_id } } : {}),
    ...(row.thumbnail ? { thumbnail: row.thumbnail } : {}),
    draft,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    ...(row.series_json ? { newSeries: JSON.parse(row.series_json) } : {}),
  };
  fs.writeFileSync(
    path.join(directory, `${id}.md`),
    `---\n${YAML.stringify(metadata)}---\n${row.markdown}`
  );
}
for (const post of posts)
  writePost(
    post,
    path.join(source, 'posts'),
    Boolean(post.draft || post.deleted_at)
  );
// Keep unpublished edits separate so they cannot replace a live article on rollback.
for (const draft of drafts) writePost(draft, path.join(output, 'drafts'), true);
fs.writeFileSync(
  path.join(source, 'series.json'),
  JSON.stringify(
    series.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      ...(row.original_url ? { originalUrl: row.original_url } : {}),
    })),
    null,
    2
  ) + '\n'
);
db.close();
console.log(
  JSON.stringify({
    output,
    publicPosts: posts.filter((row) => !row.draft && !row.deleted_at).length,
    hiddenPosts: posts.filter((row) => row.draft || row.deleted_at).length,
    drafts: drafts.length,
    series: series.length,
  })
);
