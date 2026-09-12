import fs from 'node:fs';
import { visit } from 'unist-util-visit';
import { defaultSchema } from 'rehype-sanitize';

const posts = JSON.parse(fs.readFileSync(new URL('../migration/velog-posts.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(new URL('../migration/image-manifest.json', import.meta.url), 'utf8'));
const paths = new Map(posts.map(p => [decodeURIComponent(new URL(p.originalUrl).pathname), `/blog/${encodeURIComponent(p.slug)}/`]));
const assets = new Map(manifest.map(image => [image.originalUrl, image.key]));
export const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...defaultSchema.attributes['*'], 'align'],
    img: [...defaultSchema.attributes.img, 'width', 'height', 'loading', 'decoding'],
    code: [['className', /^language-./]],
  },
};
export function remarkLanguageAliases() {
  return tree => visit(tree, 'code', node => {
    if (node.lang) node.lang = node.lang.toLowerCase();
  });
}
export function rehypeContent() {
  const origin = process.env.MEDIA_BASE_URL?.replace(/\/$/, '');
  if (origin && new URL(origin).protocol !== 'https:') throw new Error('MEDIA_BASE_URL must be HTTPS');
  return tree => {
    let hasTitleHeading = false;
    visit(tree, 'element', node => { if (node.tagName === 'h1') hasTitleHeading = true; });
    visit(tree, 'element', node => {
    if (hasTitleHeading && /^h[1-5]$/.test(node.tagName)) node.tagName = `h${Number(node.tagName[1]) + 1}`;
    if (node.tagName === 'img') {
      const source = String(node.properties.src || '');
      if (origin && assets.has(source)) node.properties.src = `${origin}/${assets.get(source)}`;
      node.properties.loading = 'lazy';
      node.properties.decoding = 'async';
      node.properties['data-lightbox'] = '';
      // Missing original alt stays empty; do not invent a description of an unseen photo.
      node.properties.alt ??= '';
    }
    if (node.tagName === 'a' && node.properties.href) {
      try {
        const target = new URL(String(node.properties.href), 'https://velog.io');
        const local = target.hostname === 'velog.io' && paths.get(decodeURIComponent(target.pathname.replace(/\/$/, '')));
        if (local) node.properties.href = local + target.search + target.hash;
      } catch { /* Keep malformed source links for the review report. */ }
    }
    });
  };
}
