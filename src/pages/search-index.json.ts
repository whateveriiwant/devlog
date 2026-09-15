import { getContent, postUrl, tagsFor } from '../lib/content';

export async function GET() {
  const { posts, series } = await getContent();
  const seriesNames = new Map(series.map((item) => [item.id, item.data.name]));

  return Response.json(
    posts.map((post) => ({
      url: postUrl(post),
      plain_excerpt: post.data.description,
      meta: {
        title: post.data.title,
        description: post.data.description,
        publishedAt: post.data.publishedAt.toISOString(),
        tags: tagsFor(post).join(' · '),
        series: post.data.series
          ? (seriesNames.get(post.data.series.id) ?? '')
          : '',
      },
      content: post.body ?? '',
    }))
  );
}
