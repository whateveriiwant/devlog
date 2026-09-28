import { useEffect, useState } from 'react';
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

interface SeriesPage {
  name: string;
  posts: SeriesPost[];
  page: number;
  totalCount: number;
}

export function D1SeriesPostPagination() {
  const [result, setResult] = useState<SeriesPage | null>(null);
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const slug = window.location.pathname
      .slice('/blog/'.length)
      .replace(/\/$/, '');
    const query = requestedPage === null ? '' : `?page=${String(requestedPage)}`;
    void fetch(`/api/content/posts/${slug}/series${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('시리즈 글 목록을 불러오지 못했습니다.');
        setResult((await response.json()) as SeriesPage);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('시리즈 글 목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [requestedPage, attempt]);

  function loadPage(page: number | null) {
    setLoading(true);
    setError('');
    setRequestedPage(page);
    setAttempt((current) => current + 1);
  }

  return (
    <>
      {result && result.totalCount > 0 && (
        <SeriesPostPagination
          name={result.name}
          posts={result.posts}
          initialPage={result.page}
          totalCount={result.totalCount}
          onPageChange={loadPage}
          loading={loading}
        />
      )}
      {loading && (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          시리즈 글 목록을 불러오는 중…
        </p>
      )}
      {error && (
        <div className="mt-4 text-sm" role="alert">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadPage(requestedPage)}
          >
            다시 시도
          </Button>
        </div>
      )}
    </>
  );
}

export default function SeriesPostPagination({
  name,
  posts,
  initialPage,
  totalCount,
  onPageChange,
  loading = false,
}: {
  name: string;
  posts: SeriesPost[];
  initialPage: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
}) {
  const [localPage, setPage] = useState(initialPage);
  const page = onPageChange ? initialPage : localPage;
  const selectPage = onPageChange ?? setPage;
  const count = totalCount ?? posts.length;
  const pageCount = Math.ceil(count / pageSize);
  const visiblePosts = onPageChange
    ? posts
    : posts.slice(page * pageSize, (page + 1) * pageSize);
  const pages =
    pageCount <= 7
      ? Array.from({ length: pageCount }, (_, index) => index)
      : [
          ...new Set([
            0,
            page - 2,
            page - 1,
            page,
            page + 1,
            page + 2,
            pageCount - 1,
          ]),
        ]
          .filter((index) => index >= 0 && index < pageCount)
          .sort((a, b) => a - b);

  return (
    <section className="related-posts" aria-labelledby="series-posts-title">
      <h2 id="series-posts-title">시리즈 전체 글</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {name} · {count}개의 글
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
          className="mt-4 flex flex-wrap items-center justify-center gap-1"
          aria-label="시리즈 글 페이지"
          aria-busy={loading}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={loading || page === 0}
            aria-label="이전 페이지"
            onClick={() => selectPage(page - 1)}
          >
            <ChevronLeft />
          </Button>
          {pages.map((index, position) => (
            <span key={index} className="inline-flex items-center gap-1">
              {position > 0 && index - pages[position - 1] > 1 && (
                <span aria-hidden="true">…</span>
              )}
              <Button
                type="button"
                variant={page === index ? 'secondary' : 'ghost'}
                size="icon-sm"
                aria-label={`${String(index + 1)}페이지`}
                aria-current={page === index ? 'page' : undefined}
                disabled={loading}
                onClick={() => selectPage(index)}
              >
                {index + 1}
              </Button>
            </span>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={loading || page === pageCount - 1}
            aria-label="다음 페이지"
            onClick={() => selectPage(page + 1)}
          >
            <ChevronRight />
          </Button>
        </nav>
      )}
    </section>
  );
}
