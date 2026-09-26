import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const snapshotBase = path.join(os.tmpdir(), 'devlog-d1-verify');
const database = process.env.D1_DATABASE || 'devlog-content-stage';
const exportResult = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('./export-d1-snapshot.mjs', import.meta.url)),
    `${snapshotBase}.sql`,
  ],
  { cwd: root, encoding: 'utf8' }
);
if (exportResult.status !== 0) {
  process.stderr.write(exportResult.stderr);
  process.exit(exportResult.status ?? 1);
}

const command = [
  'SELECT id, slug, source_hash FROM posts ORDER BY id',
  `SELECT (SELECT COUNT(*) FROM posts) AS posts,
    (SELECT COUNT(DISTINCT slug) FROM posts) AS unique_slugs,
    (SELECT COUNT(*) FROM series) AS series,
    (SELECT COUNT(*) FROM post_images) AS image_refs,
    (SELECT COUNT(*) FROM posts WHERE rendered_html != '') AS rendered_posts,
    (SELECT COUNT(*) FROM posts WHERE searchable_text != '') AS searchable_posts,
    (SELECT COUNT(*) FROM posts WHERE rendered_html LIKE '%velog.velcdn.com%' OR rendered_html LIKE '%images.velog.io%') AS old_image_hosts,
    (SELECT COUNT(*) FROM posts p LEFT JOIN series s ON p.series_id = s.id WHERE p.series_id IS NOT NULL AND s.id IS NULL) AS orphaned_series,
    (SELECT COUNT(*) FROM posts WHERE julianday(published_at) IS NULL) AS invalid_dates`,
].join('; ');
const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const wranglerArgs = [
  'exec',
  'wrangler',
  'd1',
  'execute',
  database,
  '--remote',
];
if (process.env.D1_ENV) wranglerArgs.push('--env', process.env.D1_ENV);
wranglerArgs.push(
  '--config',
  'wrangler.cms.jsonc',
  '--command',
  command,
  '--json'
);
const queryResult = spawnSync(executable, wranglerArgs, {
  cwd: root,
  encoding: 'utf8',
});
if (queryResult.status !== 0) {
  process.stderr.write(queryResult.stderr);
  process.exit(queryResult.status ?? 1);
}

const expected = JSON.parse(fs.readFileSync(`${snapshotBase}.json`, 'utf8'));
const result = JSON.parse(queryResult.stdout);
const actual = result[0].results;
const counts = result[1].results[0];
const expectedById = new Map(expected.posts.map((post) => [post.id, post]));
const missing = [...expectedById.keys()].filter(
  (id) => !actual.some((post) => post.id === id)
);
const extra = actual.filter((post) => !expectedById.has(post.id));
const mismatched = actual.filter(
  (post) => expectedById.get(post.id)?.sourceHash !== post.source_hash
);
const checks = {
  expectedPosts: expected.posts.length,
  actualPosts: actual.length,
  expectedSeries: expected.series,
  actualSeries: counts.series,
  expectedImageRefs: expected.imageRefs,
  actualImageRefs: counts.image_refs,
  renderedPosts: counts.rendered_posts,
  searchablePosts: counts.searchable_posts,
  oldImageHosts: counts.old_image_hosts,
  missing: missing.length,
  extra: extra.length,
  hashMismatch: mismatched.length,
  duplicateSlugs: counts.posts - counts.unique_slugs,
  orphanedSeries: counts.orphaned_series,
  invalidDates: counts.invalid_dates,
};
console.log(JSON.stringify(checks, null, 2));
if (
  checks.expectedPosts !== checks.actualPosts ||
  checks.expectedSeries !== checks.actualSeries ||
  checks.expectedImageRefs !== checks.actualImageRefs ||
  checks.renderedPosts !== checks.expectedPosts ||
  checks.searchablePosts !== checks.expectedPosts ||
  checks.oldImageHosts !== 0 ||
  checks.missing ||
  checks.extra ||
  checks.hashMismatch ||
  checks.duplicateSlugs ||
  checks.orphanedSeries ||
  checks.invalidDates
)
  process.exit(1);
