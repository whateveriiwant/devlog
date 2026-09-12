import { getContent, postUrl, seriesUrl } from './content';

export interface NavSection { label: string; href?: string; items: { label: string; href: string; count?: number | string; active?: boolean }[] }
export async function getNavigation(pathname: string, category?: string, seriesId?: string, postId?: string): Promise<NavSection[]> {
  const content = await getContent();
  const current = content.series.find(s => s.id === seriesId);
  const sections: NavSection[] = [{ label: '기록', items: [
    { label: '전체 글', href: '/blog/', count: content.posts.length, active: pathname === '/blog/' },
    { label: '시리즈', href: '/series/', count: content.series.length, active: pathname === '/series/' },
  ] }];
  if (current) sections.push({ label: current.data.name, href: seriesUrl(current.data.slug), items: current.posts.map((p,i) => ({label:p.data.title, href:postUrl(p), count:String(i+1).padStart(2,'0'), active:p.id===postId})) });
  sections.push({label:'주제별로 찾기', href:'/category/', items:content.categories.map(c=>({label:c.name, href:`/category/${c.id}/`,count:c.posts.length,active:c.id===category}))});
  if (!current) sections.push({label:'주요 시리즈', href:'/series/', items:['React','Node.js','운영체제','C/C++'].flatMap(name=>{const s=content.series.find(s=>s.data.name===name);return s?[{label:name,href:seriesUrl(s.data.slug),count:s.posts.length}]:[];})});
  sections.push({label:'더 찾아보기',items:[{label:'태그 모아보기',href:'/tags/',active:pathname.startsWith('/tags/')},{label:'RSS 구독',href:'/rss.xml'}]});
  return sections;
}
