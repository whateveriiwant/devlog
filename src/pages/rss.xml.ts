import rss from '@astrojs/rss';
import { getContent, postUrl } from '../lib/content';
import type { APIContext } from 'astro';
export async function GET(context: APIContext) {
  const { posts } = await getContent();
  return rss({
    title: 'seungjun.dev',
    description: '웹 개발과 컴퓨터 기초, 배움의 기록',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description.replace(/[\u0000-\u001f]/g, ''),
      pubDate: post.data.publishedAt,
      link: postUrl(post),
    })),
    customData: '<language>ko</language>',
  });
}
