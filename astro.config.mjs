import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { unified, rehypeShiki } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { rehypeContent, remarkLanguageAliases, sanitizeSchema } from './scripts/rehype-content.mjs';

try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const configuredSite = process.env.SITE_URL?.replace(/\/$/, '');
if (configuredSite && (new URL(configuredSite).protocol !== 'https:' || new URL(configuredSite).origin !== configuredSite)) {
  throw new Error('SITE_URL must be your real HTTPS origin with no path');
}
const mediaOrigin = process.env.MEDIA_BASE_URL?.replace(/\/$/, '');
if (mediaOrigin) {
  if (new URL(mediaOrigin).protocol !== 'https:' || new URL(mediaOrigin).origin !== mediaOrigin) throw new Error('MEDIA_BASE_URL must be your real HTTPS origin with no path');
  const reportPath = new URL('./migration/image-verification.json', import.meta.url);
  if (!fs.existsSync(reportPath)) throw new Error('Run pnpm images:verify before enabling MEDIA_BASE_URL for the site');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(new URL('./migration/image-manifest.json', import.meta.url), 'utf8'));
  const verifiedKeys = new Set(report.checks?.filter(check => check.status === 'verified').map(check => check.key));
  if (!report.complete || report.origin !== mediaOrigin || !manifest.every(image => verifiedKeys.has(image.key))) throw new Error('R2 verification must cover every manifest image at MEDIA_BASE_URL');
}
const highlight = [rehypeShiki, { themes: { light: 'github-light', dark: 'github-dark' }, wrap: false }];
export default defineConfig({
  site: configuredSite || 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [
    react(),
    mdx({ processor: unified({ smartypants: false, remarkPlugins: [remarkLanguageAliases], rehypePlugins: [rehypeContent, highlight] }) }),
    ...(configuredSite ? [sitemap()] : []),
  ],
  markdown: {
    syntaxHighlight: false,
    processor: unified({
      smartypants: false,
      remarkPlugins: [remarkLanguageAliases],
      rehypePlugins: [rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeContent, highlight],
    }),
  },
  vite: { plugins: [tailwindcss()] },
});
