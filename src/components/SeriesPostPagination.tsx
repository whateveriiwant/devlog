import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

interface SeriesPost {
  href: string;
  title: string;
  date: string;
  position: number;
  current: boolean;
}

const pageSize = 4;

export default function SeriesPostPagination({
  name,
  posts,
  initialPage,
}: {
  name: string;
  posts: SeriesPost[];
  initialPage: number;
}) {
  const [page, setPage] = useState(initialPage);
  const pageCount = Math.ceil(posts.length / pageSize);
  const visiblePosts = posts.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <section className="related-posts" aria-labelledby="series-posts-title">
      <h2 id="series-posts-title">시리즈 전체 글</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {name} · {posts.length}개의 글
      </p>
      <div aria-live="polite">
        {visiblePosts.map((post) => (
          <a
            key={post.href}
            href={post.href}
            aria-current={post.current ? 'page' : undefined}
            className={post.current ? 'bg-accent/60' : undefined}
          >
            <span>
              <span className="mr-3 text-xs tabular-nums text-muted-foreground">
                {String(post.position).padStart(2, '0')}
              </span>
              {post.title}
            </span>
            <span className="count">
              {post.date}
              {post.current ? ' · 현재 글' : ' ↗'}
            </span>
          </a>
        ))}
      </div>
      {pageCount > 1 && (
        <nav
          className="mt-4 flex items-center justify-center gap-1"
          aria-label="시리즈 글 페이지"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={page === 0}
            aria-label="이전 페이지"
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft />
          </Button>
          {Array.from({ length: pageCount }, (_, index) => (
            <Button
              key={index}
              type="button"
              variant={page === index ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={`${String(index + 1)}페이지`}
              aria-current={page === index ? 'page' : undefined}
              onClick={() => setPage(index)}
            >
              {index + 1}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={page === pageCount - 1}
            aria-label="다음 페이지"
            onClick={() => setPage((current) => current + 1)}
          >
            <ChevronRight />
          </Button>
        </nav>
      )}
    </section>
  );
}
