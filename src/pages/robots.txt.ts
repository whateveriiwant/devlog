export function GET() {
  const enabled = process.env.SITE_URL && process.env.ALLOW_INDEXING === 'true';
  return new Response(enabled ? `User-agent: *\nAllow: /\nSitemap: ${process.env.SITE_URL!.replace(/\/$/, '')}/sitemap-index.xml\n` : 'User-agent: *\nDisallow: /\n', {headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
