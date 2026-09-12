import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { stringify } from 'yaml';

const root = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const posts = read('migration/velog-posts.json');
const series = read('migration/velog-series.json');
const previous = fs.existsSync(path.join(root, 'migration/file-manifest.json')) ? read('migration/file-manifest.json') : [];
const memberships = new Map();
for (const s of series) for (const p of s.posts) {
  if (memberships.has(p.id)) throw new Error(`Multiple series need review: ${p.id}`);
  memberships.set(p.id, { id: s.id, order: p.order });
}
const planned = posts.map(post => {
  if (!post.isMarkdown || hash(post.content) !== post.contentSha256) throw new Error(`Source format/hash needs review: ${post.title}`);
  const metadata = {
    title: post.title, description: post.description, slug: post.slug,
    publishedAt: post.publishedAt, updatedAt: post.updatedAt,
    ...(memberships.has(post.id) ? { series: memberships.get(post.id) } : {}),
    tags: post.tags, draft: false, originalUrl: post.originalUrl,
    ...(post.thumbnail ? { thumbnail: post.thumbnail } : {}),
  };
  return { path: `src/content/posts/${post.id}.md`, content: `---\n${stringify(metadata, { lineWidth: 0 })}---\n${post.content}`, sourceId: post.id };
});
planned.push({ path: 'src/content/series.json', content: JSON.stringify(series.map(s => ({ id: s.id, name: s.name, slug: s.url_slug, description: s.description || '', originalUrl: s.originalUrl })), null, 2) + '\n' });
// Check every destination before writing any: reruns never overwrite an author's edits.
for (const file of planned) {
  const full = path.join(root, file.path);
  if (!fs.existsSync(full)) continue;
  const current = fs.readFileSync(full, 'utf8');
  const last = previous.find(p => p.path === file.path);
  if (current !== file.content && (!last || hash(current) !== last.sha256)) throw new Error(`Local edit protected: ${file.path}`);
}
for (const file of planned) {
  fs.mkdirSync(path.dirname(path.join(root, file.path)), { recursive: true });
  fs.writeFileSync(path.join(root, file.path), file.content);
}
fs.writeFileSync(path.join(root, 'migration/file-manifest.json'), JSON.stringify(planned.map(f => ({ path: f.path, sourceId: f.sourceId, sha256: hash(f.content) })), null, 2) + '\n');
console.log(`Migrated ${posts.length} posts and ${series.length} series. Body bytes unchanged.`);
