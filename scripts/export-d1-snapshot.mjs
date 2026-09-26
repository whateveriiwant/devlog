import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import YAML from 'yaml';

const postsDir = new URL('../src/content/posts/', import.meta.url);
const seriesPath = new URL('../src/content/series.json', import.meta.url);
const manifestPath = new URL(
  '../migration/image-manifest.json',
  import.meta.url
);
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const mediaOrigin = 'https://media.seungjun.sh';
const outputPath = process.argv[2] || '/tmp/devlog-d1-snapshot.sql';
const sql = (value) =>
  value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => JSON.stringify(value ?? []);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

const filenames = fs
  .readdirSync(postsDir)
  .filter((filename) => /\.(md|mdx)$/.test(filename))
  .sort();
const series = JSON.parse(fs.readFileSync(seriesPath, 'utf8'));
const imageManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const imageKeysByUrl = new Map(
  imageManifest.map((image) => [image.originalUrl, image.key])
);
const inserts = [];
const expected = [];
const ids = new Set();
const slugs = new Set();
let imageRefCount = 0;

for (const filename of filenames) {
  if (filename.endsWith('.mdx'))
    throw new Error(
      `MDX cannot be imported without a runtime compiler: ${filename}`
    );
  const source = fs.readFileSync(new URL(filename, postsDir), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) throw new Error(`Missing YAML frontmatter: ${filename}`);
  const data = YAML.parse(match[1]);
  const body = source.slice(match[0].length).replace(/\s+$/, '');
  const id = path.basename(filename, '.md');
  if (!data?.slug || !data?.title || !data?.publishedAt)
    throw new Error(`Invalid required frontmatter: ${filename}`);
  if (ids.has(id) || slugs.has(data.slug))
    throw new Error(`Duplicate ID or slug: ${filename}`);
  ids.add(id);
  slugs.add(data.slug);
  const sourceHash = hash(`${JSON.stringify(data)}\n${body}`);
  const htmlPath = path.join(distDir, 'blog', data.slug, 'index.html');
  if (!fs.existsSync(htmlPath))
    throw new Error(`Built page not found; run pnpm build first: ${htmlPath}`);
  const $ = load(fs.readFileSync(htmlPath, 'utf8'));
  const prose = $('article .prose').first();
  if (!prose.length) throw new Error(`Rendered article body missing: ${id}`);
  prose.find('img[src]').each((_, image) => {
    const original = $(image).attr('src');
    const key = imageKeysByUrl.get(original);
    if (key) $(image).attr('src', `${mediaOrigin}/${key}`);
  });
  const renderedHtml = prose.html() || '';
  const headings = prose
    .find('h1, h2, h3, h4, h5, h6')
    .map((_, heading) => ({
      depth: Number(heading.tagName[1]),
      slug: $(heading).attr('id') || '',
      text: $(heading).text(),
    }))
    .get();
  const searchableText = prose.text().replace(/\s+/g, ' ').trim();
  const thumbnailKey = imageKeysByUrl.get(data.thumbnail);
  const thumbnail = data.thumbnail
    ? thumbnailKey
      ? `${mediaOrigin}/${thumbnailKey}`
      : data.thumbnail
    : null;
  const imageSources = [
    ...[
      ...body.matchAll(/!?\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/g),
    ].map((item) => item[1]),
    data.thumbnail,
  ].filter(Boolean);
  const imageKeys = [
    ...new Set(
      imageSources.flatMap((source) => {
        const migrated = imageKeysByUrl.get(source);
        if (migrated) return [migrated];
        const current = /^https:\/\/media\.seungjun\.sh\/(.+)$/.exec(source);
        return current ? [current[1]] : [];
      })
    ),
  ];
  imageRefCount += imageKeys.length;
  inserts.push(
    `INSERT INTO posts (id, slug, title, description, markdown, published_at, updated_at, tags_json, series_id, thumbnail, draft, source_hash, rendered_html, headings_json, searchable_text) VALUES (${[
      sql(id),
      sql(data.slug),
      sql(data.title),
      sql(data.description || ''),
      sql(body),
      sql(new Date(data.publishedAt).toISOString()),
      sql(data.updatedAt ? new Date(data.updatedAt).toISOString() : null),
      sql(json(data.tags)),
      sql(data.series?.id || null),
      sql(thumbnail),
      data.draft ? 1 : 0,
      sql(sourceHash),
      sql(renderedHtml),
      sql(json(headings)),
      sql(searchableText),
    ].join(', ')});`
  );
  for (const key of imageKeys)
    inserts.push(
      `INSERT INTO post_images (post_id, r2_key) VALUES (${sql(id)}, ${sql(key)});`
    );
  expected.push({ id, slug: data.slug, sourceHash });
}

for (const item of series) {
  inserts.push(
    `INSERT INTO series (id, name, slug, description, original_url) VALUES (${[
      sql(item.id),
      sql(item.name),
      sql(item.slug),
      sql(item.description || ''),
      sql(item.originalUrl || null),
    ].join(', ')});`
  );
}

fs.writeFileSync(outputPath, inserts.join('\n') + '\n');
const reportPath = outputPath.replace(/\.sql$/, '.json');
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      source: 'src/content/posts',
      posts: expected,
      series: series.length,
      imageRefs: imageRefCount,
    },
    null,
    2
  ) + '\n'
);
console.log(
  JSON.stringify({
    posts: expected.length,
    series: series.length,
    imageRefs: imageRefCount,
    sql: outputPath,
    report: reportPath,
  })
);
