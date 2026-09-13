import { getCollection, type CollectionEntry } from 'astro:content';
import taxonomy from '../../migration/taxonomy.json';
import manifest from '../../migration/image-manifest.json';

export type Post = CollectionEntry<'posts'>;
const aliases: Record<string, string> = taxonomy.tagAliases;
export const normalizeTag = (tag: string) => aliases[tag] || tag;
export const tagSlug = (tag: string) =>
  normalizeTag(tag)
    .replaceAll('C++', 'cpp')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
export const tagsFor = (post: Post) => [
  ...new Set(post.data.tags.map(normalizeTag)),
];
export const postUrl = (post: Post) =>
  `/blog/${encodeURIComponent(post.data.slug)}/`;
export const seriesUrl = (slug: string) =>
  `/series/${encodeURIComponent(slug)}/`;
export const tagUrl = (tag: string) =>
  `/tags/${encodeURIComponent(tagSlug(tag))}/`;
export const dateKey = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
export const dateLabel = (date: Date) => dateKey(date).replaceAll('-', '.');
export const readMinutes = (post: Post) =>
  Math.max(
    1,
    Math.ceil(
      (post.body || '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/https?:\/\/\S+/g, '').length / 700
    )
  );
export function imageUrl(source?: string) {
  if (!source) return undefined;
  const origin = process.env.MEDIA_BASE_URL?.replace(/\/$/, '');
  const item = origin && manifest.find((i) => i.originalUrl === source);
  return item ? `${origin}/${item.key}` : source;
}
export async function getContent() {
  const posts = (await getCollection('posts', ({ data }) => !data.draft)).sort(
    (a, b) =>
      b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf() ||
      a.id.localeCompare(b.id)
  );
  const groups = (await getCollection('series'))
    .map((s) => ({
      ...s,
      posts: posts
        .filter((p) => p.data.series?.id === s.id)
        .sort((a, b) => a.data.series!.order - b.data.series!.order),
    }))
    .filter((s) => s.posts.length);
  const tags = [...new Set(posts.flatMap(tagsFor))]
    .map((name) => ({
      name,
      posts: posts.filter((p) => tagsFor(p).includes(name)),
    }))
    .sort(
      (a, b) =>
        b.posts.length - a.posts.length || a.name.localeCompare(b.name, 'ko')
    );
  const years = [
    ...new Set(posts.map((p) => dateKey(p.data.publishedAt).slice(0, 4))),
  ]
    .sort()
    .reverse()
    .map((year) => ({
      year,
      posts: posts.filter((p) => dateKey(p.data.publishedAt).startsWith(year)),
    }));
  return { posts, series: groups, tags, years };
}
