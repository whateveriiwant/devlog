import { getContent, postUrl, seriesUrl } from './content';

export interface NavSection {
  label: string;
  href?: string;
  initialCount?: number;
  moreLabel?: string;
  items: {
    label: string;
    href: string;
    count?: number | string;
    active?: boolean;
  }[];
}
export async function getNavigation(
  pathname: string,
  seriesId?: string,
  postId?: string
): Promise<NavSection[]> {
  const content = await getContent();
  const current = content.series.find((s) => s.id === seriesId);
  const sections: NavSection[] = [
    {
      label: '기록',
      items: [
        {
          label: '전체 글',
          href: '/blog/',
          count: content.posts.length,
          active: pathname === '/blog/',
        },
        {
          label: '시리즈',
          href: '/series/',
          count: content.series.length,
          active: pathname === '/series/',
        },
      ],
    },
  ];
  if (current)
    sections.push({
      label: current.data.name,
      href: seriesUrl(current.data.slug),
      initialCount: 5,
      moreLabel: '시리즈 글 더 보기',
      items: current.posts.map((p, i) => ({
        label: p.data.title,
        href: postUrl(p),
        count: String(i + 1).padStart(2, '0'),
        active: p.id === postId,
      })),
    });
  if (!current)
    sections.push({
      label: '시리즈',
      href: '/series/',
      initialCount: 4,
      moreLabel: '시리즈 더 보기',
      items: [...content.series]
        .sort(
          (a, b) =>
            Math.max(...b.posts.map((post) => post.data.publishedAt.valueOf())) -
            Math.max(...a.posts.map((post) => post.data.publishedAt.valueOf()))
        )
        .map((series) => ({
          label: series.data.name,
          href: seriesUrl(series.data.slug),
          count: series.posts.length,
        })),
    });
  sections.push({
    label: '더 찾아보기',
    items: [
      {
        label: '태그 모아보기',
        href: '/tags/',
        active: pathname.startsWith('/tags/'),
      },
    { label: '프로필', href: '/profile/', active: pathname === '/profile/' },
    { label: 'RSS 구독', href: '/rss.xml' },
    ],
  });
  return sections;
}
