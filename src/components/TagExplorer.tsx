import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TagNode {
  name: string;
  count: number;
  href: string;
}

interface TagLink {
  source: string;
  target: string;
  count: number;
}

interface PositionedTag extends TagNode {
  x: number;
  y: number;
  radius: number;
}

function positionTags(nodes: TagNode[]): PositionedTag[] {
  const maxCount = Math.max(...nodes.map((node) => node.count));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return nodes.map((node, index) => {
    if (index === 0) {
      return { ...node, x: 380, y: 210, radius: 13 };
    }
    const distance = 42 + Math.sqrt(index / nodes.length) * 168;
    const angle = index * goldenAngle - Math.PI / 2;
    return {
      ...node,
      x: 380 + Math.cos(angle) * distance * 1.65,
      y: 210 + Math.sin(angle) * distance,
      radius: 5 + (node.count / maxCount) * 8,
    };
  });
}

export default function TagExplorer({
  graphNodes,
  graphLinks,
  allTags,
}: {
  graphNodes: TagNode[];
  graphLinks: TagLink[];
  allTags: TagNode[];
}) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'popular' | 'alphabetical'>('popular');
  const positioned = useMemo(() => positionTags(graphNodes), [graphNodes]);
  const positions = useMemo(
    () => new Map(positioned.map((node) => [node.name, node])),
    [positioned]
  );
  const connected = useMemo(() => {
    const names = new Set<string>();
    if (!activeTag) return names;
    names.add(activeTag);
    graphLinks.forEach((link) => {
      if (link.source === activeTag) names.add(link.target);
      if (link.target === activeTag) names.add(link.source);
    });
    return names;
  }, [activeTag, graphLinks]);
  const visibleTags = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko');
    const filtered = normalized
      ? allTags.filter((tag) =>
          tag.name.toLocaleLowerCase('ko').includes(normalized)
        )
      : [...allTags];
    return filtered.sort((a, b) =>
      sort === 'popular'
        ? b.count - a.count || a.name.localeCompare(b.name, 'ko')
        : a.name.localeCompare(b.name, 'ko')
    );
  }, [allTags, query, sort]);

  return (
    <div>
      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">키워드 연결 그래프</h2>
          <p className="text-xs text-muted-foreground">
            점을 선택해 관련 태그를 살펴보세요
          </p>
        </div>

        <div className="relative bg-[radial-gradient(circle_at_center,var(--muted)_0,transparent_68%)]">
          <svg
            viewBox="0 0 760 420"
            className="block h-auto min-h-80 w-full"
            role="img"
            aria-label="글에 함께 사용된 주요 태그의 연결 그래프"
          >
            <defs>
              <pattern id="tag-stars" width="38" height="38" patternUnits="userSpaceOnUse">
                <circle cx="4" cy="5" r="0.7" fill="currentColor" opacity="0.13" />
                <circle cx="27" cy="23" r="0.45" fill="currentColor" opacity="0.1" />
              </pattern>
            </defs>
            <rect width="760" height="420" fill="url(#tag-stars)" className="text-foreground" />

            <g>
              {graphLinks.map((link) => {
                const source = positions.get(link.source);
                const target = positions.get(link.target);
                if (!source || !target) return null;
                const active = !activeTag || (connected.has(link.source) && connected.has(link.target));
                return (
                  <line
                    key={`${link.source}-${link.target}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="currentColor"
                    strokeWidth={Math.min(2.4, 0.45 + link.count * 0.35)}
                    className={`text-border transition-opacity ${active ? 'opacity-80' : 'opacity-10'}`}
                  />
                );
              })}
            </g>

            <g>
              {positioned.map((node, index) => {
                const active = !activeTag || connected.has(node.name);
                const selected = activeTag === node.name;
                return (
                  <a
                    key={node.name}
                    href={node.href}
                    onMouseEnter={() => setActiveTag(node.name)}
                    onMouseLeave={() => setActiveTag(null)}
                    onFocus={() => setActiveTag(node.name)}
                    onBlur={() => setActiveTag(null)}
                    aria-label={`${node.name}, ${node.count}개의 글`}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={selected ? node.radius + 3 : node.radius}
                      className={`transition-all ${index < 5 ? 'fill-foreground' : 'fill-background'} stroke-foreground ${active ? 'opacity-100' : 'opacity-20'}`}
                      strokeWidth={index < 5 ? 1 : 1.4}
                    />
                    {(index < 12 || selected) && (
                      <text
                        x={node.x}
                        y={node.y + node.radius + 15}
                        textAnchor="middle"
                        className={`fill-foreground text-[11px] font-medium transition-opacity ${active ? 'opacity-100' : 'opacity-20'}`}
                      >
                        {node.name}
                      </text>
                    )}
                  </a>
                );
              })}
            </g>
          </svg>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="all-tags-heading">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="all-tags-heading" className="text-2xl font-semibold tracking-tight">
              모든 태그
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {allTags.length}개의 키워드에서 글을 찾아보세요.
            </p>
          </div>
          <div className="inline-flex h-9 w-fit items-center rounded-lg bg-muted p-1" aria-label="태그 정렬 방식">
            {(['popular', 'alphabetical'] as const).map((value) => {
              const active = sort === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSort(value)}
                  aria-pressed={active}
                  className={`h-7 rounded-md px-3 text-xs font-medium transition-[background-color,color,box-shadow] ${active ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {value === 'popular' ? '인기순' : '가나다순'}
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-6 flex h-10 items-center gap-2 rounded-lg border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/50">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">태그 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="태그 검색"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && <span className="text-xs text-muted-foreground">{visibleTags.length}개</span>}
        </label>

        {visibleTags.length > 0 ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {visibleTags.map((tag) => (
              <a
                key={tag.name}
                href={tag.href}
                className="group flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/60"
              >
                <span className="truncate text-sm font-medium">#{tag.name}</span>
                <Badge variant="secondary" className="tabular-nums">
                  {tag.count}
                </Badge>
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            일치하는 태그가 없습니다.
          </div>
        )}
      </section>
    </div>
  );
}
