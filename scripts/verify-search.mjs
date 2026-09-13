import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const bundle = path.join(root, 'dist/pagefind');
const read = async (file) =>
  JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const posts = await read('migration/velog-posts.json');
const taxonomy = await read('migration/taxonomy.json');
const series = await read('migration/velog-series.json');
const entry = await read('dist/pagefind/pagefind-entry.json');
assert.equal(entry.languages.ko.page_count, posts.length);

// Execute the actual generated search module and WASM against local index files.
// This checks retrieval and metadata; it does not simulate browser dialog/worker events.
globalThis.document = {
  currentScript: null,
  querySelector: () => ({ getAttribute: () => 'ko' }),
};
globalThis.fetch = async (input) => {
  const file = fileURLToPath(input instanceof Request ? input.url : input);
  assert.ok(
    file.startsWith(bundle + path.sep),
    'Search fetch stays inside the built bundle'
  );
  return new Response(await fs.readFile(file));
};
const pagefind = await import(
  pathToFileURL(path.join(bundle, 'pagefind.js')).href
);
await pagefind.options({
  basePath: pathToFileURL(bundle + path.sep).href,
  baseUrl: '/',
});
const all = await pagefind.search(null);
assert.equal(
  all.results.length,
  posts.length,
  'Every migrated article is searchable'
);
const documents = await Promise.all(all.results.map((hit) => hit.data()));
for (const post of posts) {
  const doc = documents.find(
    (doc) => decodeURIComponent(doc.url) === `/blog/${post.slug}/`
  );
  assert.ok(doc, `Search URL: ${post.title}`);
  assert.equal(
    doc.meta.title,
    post.title.replace(/\s+/g, ' ').trim(),
    'Search title'
  );
  assert.equal(
    doc.meta.description || '',
    post.description
      .replace(/[\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    'Search description'
  );
  assert.equal(
    doc.meta.publishedAt,
    post.publishedAt,
    'Search publication date'
  );
  const group = series.find((s) => s.posts.some((p) => p.id === post.id));
  assert.equal(doc.meta.series || '', group?.name || '', 'Search series');
  const tags = [
    ...new Set(post.tags.map((tag) => taxonomy.tagAliases[tag] || tag)),
  ];
  assert.equal(doc.meta.tags || '', tags.join(' · '), 'Search tag boundaries');
}
const queries = [];
for (const [query, expectedSlug] of [
  ['해피해킹', '개발자-기준-해피해킹-리뷰'],
  ['이벤트 루프', 'JavaScriptNode.js-이벤트-루프'],
  ['useEffect', 'useEffect로-fetch-할-때-마주할-수-있는-세-가지-함정'],
  ['Express', 'C언어-Express-9장-05'],
]) {
  const result = await pagefind.search(query);
  const data = await Promise.all(result.results.map((hit) => hit.data()));
  assert.ok(
    data.some(
      (doc) => decodeURIComponent(doc.url) === `/blog/${expectedSlug}/`
    ),
    `Query: ${query}`
  );
  queries.push({ query, results: data.length, expectedFound: true });
}
// Unquoted Pagefind queries allow partial matches; use an absent exact phrase here.
assert.equal(
  (await pagefind.search('"zzzxqv987654nomatch"')).results.length,
  0
);
const result = {
  verifiedAt: new Date().toISOString(),
  pagefindVersion: entry.version,
  indexedArticles: documents.length,
  metadataChecks: ['title', 'description', 'publishedAt', 'series', 'tags'],
  queries,
  noResultsCase: 'passed',
  scope:
    'Generated JavaScript/WASM search API in Node; browser interactions and worker execution are not covered.',
};
await fs.writeFile(
  path.join(root, 'migration/search-verification.json'),
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result, null, 2));
