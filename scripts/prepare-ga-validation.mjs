import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const output = path.join(root, '.wrangler/ga-validation-assets');
const templatePath = 'ga-validation/template/index.html';
const template = fs.readFileSync(path.join(dist, templatePath), 'utf8');
assert.match(template, /data-template-analytics-environment="validation"/);
assert.match(template, /data-template-analytics-measurement-id="G-8SFTFGKZ9Y"/);
assert.match(template, /noindex,nofollow/);
assert.doesNotMatch(
  template,
  /astro-island|G-RQ6456HXLD|data-template-indexable/
);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'ga-validation/template'), { recursive: true });
fs.writeFileSync(path.join(output, templatePath), template);
const copied = new Set();
// Follow only this synthetic template's assets; never copy blog HTML or images.
function copyReferences(text) {
  for (const [, relative] of text.matchAll(
    /(?:\/|\.\/)_astro\/([A-Za-z0-9_.-]+\.(?:js|css|woff2))/g
  ))
    copyAsset(relative);
}
function copyAsset(name) {
  if (copied.has(name)) return;
  copied.add(name);
  const file = path.join(dist, '_astro', name);
  let content = fs.readFileSync(file);
  // Validation uses system fonts; don't add another third-party request.
  if (name.endsWith('.css'))
    content = Buffer.from(
      content.toString().replace(/@import\s+url\([^)]*\);?/g, '')
    );
  fs.mkdirSync(path.join(output, '_astro'), { recursive: true });
  fs.writeFileSync(path.join(output, '_astro', name), content);
  if (!name.endsWith('.woff2')) {
    const text = content.toString();
    copyReferences(text);
    for (const [, sibling] of text.matchAll(
      /["']\.\/([A-Za-z0-9_.-]+\.(?:js|css|woff2))["']/g
    ))
      copyAsset(sibling);
  }
}
copyReferences(template);
assert.ok(copied.size > 0, 'The shared analytics bundle is included');
console.log(
  `PASS: isolated validation template and ${copied.size} referenced assets; no real article/image assets`
);
