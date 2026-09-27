import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FileText,
  FolderOpen,
  LoaderCircle,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';

type Status = 'published' | 'drafts' | 'trash';
interface Post {
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
  revision: number;
  hasDraft?: boolean;
  deletedAt?: string;
  seriesName?: string;
  seriesId?: string | null;
  updatedAt?: string;
}
interface Draft {
  id: string;
  title: string;
  revision?: number;
  baseRevision?: number;
  isPublished?: boolean;
  seriesId?: string | null;
  seriesName?: string;
  updatedAt?: string;
}
interface Series {
  id: string;
  name: string;
}
interface Dashboard {
  posts: Post[];
  drafts: Draft[];
  series: Series[];
  trash: Post[];
}

const PAGE_SIZE = 12;
const tabs: { id: Status; label: string }[] = [
  { id: 'published', label: '발행됨' },
  { id: 'drafts', label: '초안' },
  { id: 'trash', label: '휴지통' },
];

function dateLabel(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
}

export default function AdminDashboard() {
  const [token] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (sessionStorage.getItem('devlog-editor-token') ?? '')
  );
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [status, setStatus] = useState<Status>('published');
  const [search, setSearch] = useState('');
  const [seriesId, setSeriesId] = useState('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      window.location.replace('/login/?next=%2Fadmin%2F');
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    void fetch('/api/content/editor-config')
      .then(async (response) => {
        if (!response.ok) throw new Error('편집기 설정을 확인하지 못했습니다.');
        return (await response.json()) as { enabled: boolean };
      })
      .then(async (config) => {
        if (!config.enabled)
          throw new Error('현재 글 관리 API를 사용할 수 없습니다.');
        const response = await fetch('/api/content/editor/posts', { headers });
        const result = (await response.json()) as Dashboard & {
          error?: string;
        };
        if (response.status === 401)
          throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
        if (!response.ok)
          throw new Error(result.error ?? '글 목록을 불러오지 못했습니다.');
        setDashboard(result);
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : '글 목록을 불러오지 못했습니다.'
        );
        if (reason instanceof Error && reason.message.includes('로그인')) {
          sessionStorage.removeItem('devlog-editor-token');
          window.location.replace('/login/?next=%2Fadmin%2F');
        }
      });
  }, [token]);

  const source = useMemo(() => {
    if (!dashboard) return [];
    if (status === 'published') return dashboard.posts;
    if (status === 'trash') return dashboard.trash;
    return dashboard.drafts.filter((draft) => !draft.isPublished);
  }, [dashboard, status]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ko-KR');
    return source.filter((item) => {
      const titleMatch = item.title.toLocaleLowerCase('ko-KR').includes(needle);
      const seriesMatch = seriesId === 'all' || item.seriesId === seriesId;
      return titleMatch && seriesMatch;
    });
  }, [search, seriesId, source]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const counts = {
    published: dashboard?.posts.length ?? 0,
    drafts: dashboard?.drafts.filter((draft) => !draft.isPublished).length ?? 0,
    trash: dashboard?.trash.length ?? 0,
  };

  async function editorRequest(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`/api/content/editor${path}`, {
      ...options,
      headers,
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      throw new Error(result.error ?? '요청을 처리하지 못했습니다.');
  }

  async function restore(post: Post) {
    setBusyId(post.id);
    setError('');
    try {
      await editorRequest(`/posts/${encodeURIComponent(post.id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      });
      setDashboard(
        (current) =>
          current && {
            ...current,
            trash: current.trash.filter((item) => item.id !== post.id),
            posts: [
              post,
              ...current.posts.filter((item) => item.id !== post.id),
            ],
          }
      );
      setMessage(`“${post.title}” 글을 복구했습니다.`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '복구에 실패했습니다.'
      );
    } finally {
      setBusyId('');
    }
  }

  async function moveToTrash(post: Post) {
    if (
      !window.confirm(
        `“${post.title}” 글을 휴지통으로 이동할까요? 7일 안에는 복구할 수 있습니다.`
      )
    )
      return;
    setBusyId(post.id);
    setError('');
    try {
      await editorRequest(`/posts/${encodeURIComponent(post.id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      });
      setDashboard(
        (current) =>
          current && {
            ...current,
            posts: current.posts.filter((item) => item.id !== post.id),
            trash: [
              { ...post, deletedAt: new Date().toISOString() },
              ...current.trash,
            ],
          }
      );
      setMessage(`“${post.title}” 글을 휴지통으로 이동했습니다.`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '삭제에 실패했습니다.'
      );
    } finally {
      setBusyId('');
    }
  }

  function edit(id: string) {
    window.location.assign(`/write/?post=${encodeURIComponent(id)}`);
  }

  const loading = !dashboard && !error;

  return (
    <main className="min-h-screen bg-muted/35 px-4 pb-16 pt-6 text-foreground sm:px-8 sm:pt-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <a
            href="/"
            className="flex items-center gap-3 text-sm font-semibold tracking-tight"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              d.
            </span>
            <span>
              devlog{' '}
              <span className="font-normal text-muted-foreground">관리</span>
            </span>
          </a>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <a href="/">
                블로그 보기 <ExternalLink />
              </a>
            </Button>
            <Button asChild>
              <a href="/write/">
                <Plus />새 글 쓰기
              </a>
            </Button>
          </div>
        </header>

        <section className="mb-7">
          <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted-foreground">
            CONTENT
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                글 관리
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                글을 찾고 수정하거나 발행 상태를 관리합니다.
              </p>
            </div>
            <span className="text-sm text-muted-foreground">
              {counts.published.toLocaleString('ko-KR')}개 발행됨
            </span>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div
            className="flex gap-1 border-b px-4 pt-3 sm:px-6"
            role="tablist"
            aria-label="글 상태"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={status === tab.id}
                onClick={() => {
                  setStatus(tab.id);
                  setPage(1);
                }}
                className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${status === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {tab.label}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                  {counts[tab.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:px-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="제목 검색"
                className="pl-9"
                placeholder="제목으로 검색"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground sm:w-56">
              <FolderOpen className="size-4 shrink-0" />
              <select
                aria-label="시리즈 선택"
                className="w-full bg-transparent text-foreground outline-none"
                value={seriesId}
                onChange={(event) => {
                  setSeriesId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">모든 시리즈</option>
                {(dashboard?.series ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {message && (
            <p
              className="border-b bg-emerald-50 px-5 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              role="status"
            >
              {message}
            </p>
          )}
          {error && (
            <p
              className="border-b bg-destructive/5 px-5 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}

          {loading ? (
            <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin" />글 목록 불러오는
                중
              </span>
            </div>
          ) : rows.length === 0 ? (
            <div className="grid min-h-72 place-items-center px-6 text-center">
              <div className="max-w-sm">
                <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-muted">
                  <FileText className="size-5 text-muted-foreground" />
                </span>
                <h2 className="font-medium">
                  {search
                    ? '검색 결과가 없습니다'
                    : status === 'trash'
                      ? '휴지통이 비어 있습니다'
                      : status === 'drafts'
                        ? '초안이 없습니다'
                        : '발행된 글이 없습니다'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {search
                    ? '다른 제목으로 검색해 보세요.'
                    : status === 'published'
                      ? '첫 글을 작성해 보세요.'
                      : '이 상태의 글이 생기면 여기에 표시됩니다.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1fr)_150px_140px_116px] items-center gap-4 bg-muted/35 px-6 py-3 text-xs font-medium text-muted-foreground md:grid">
                <span>제목</span>
                <span>시리즈</span>
                <span>
                  {status === 'trash'
                    ? '삭제일'
                    : status === 'drafts'
                      ? '수정일'
                      : '발행일'}
                </span>
                <span className="text-right">관리</span>
              </div>
              <ul className="divide-y">
                {rows.map((item) => {
                  const post = item as Post;
                  const isDraft = status === 'drafts';
                  const rowId = item.id;
                  const rowBusy = busyId === rowId;
                  const seriesName =
                    post.seriesName ?? (item as Draft).seriesName;
                  return (
                    <li
                      key={`${status}-${rowId}`}
                      className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/25 sm:px-6 md:grid-cols-[minmax(0,1fr)_150px_140px_116px] md:items-center md:gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            className="truncate font-medium hover:underline"
                            href={
                              status === 'published'
                                ? `/blog/${encodeURIComponent(post.slug)}/`
                                : undefined
                            }
                            onClick={
                              status === 'published'
                                ? undefined
                                : (event) => {
                                    event.preventDefault();
                                    edit(rowId);
                                  }
                            }
                          >
                            {item.title || '제목 없음'}
                          </a>
                          {status === 'published' && post.hasDraft && (
                            <Badge variant="secondary">수정 중</Badge>
                          )}
                          {isDraft && <Badge variant="outline">초안</Badge>}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {status === 'published'
                            ? `/blog/${post.slug}/`
                            : isDraft
                              ? '미발행 초안'
                              : `삭제 ${dateLabel(post.deletedAt)}`}
                        </p>
                        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground md:hidden">
                          <span>{seriesName ?? '시리즈 없음'}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {dateLabel(
                              status === 'trash'
                                ? post.deletedAt
                                : isDraft
                                  ? (item as Draft).updatedAt
                                  : post.publishedAt
                            )}
                          </span>
                        </p>
                      </div>
                      <div className="hidden text-sm text-muted-foreground md:block">
                        {seriesName ?? (
                          <span className="text-muted-foreground/60">
                            시리즈 없음
                          </span>
                        )}
                      </div>
                      <div className="hidden text-sm text-muted-foreground md:block">
                        {dateLabel(
                          status === 'trash'
                            ? post.deletedAt
                            : isDraft
                              ? (item as Draft).updatedAt
                              : post.publishedAt
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        {status === 'trash' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => void restore(post)}
                          >
                            <RotateCcw />
                            복구
                          </Button>
                        ) : (
                          <>
                            {status === 'published' && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="글 보기"
                                asChild
                              >
                                <a
                                  href={`/blog/${encodeURIComponent(post.slug)}/`}
                                >
                                  <ExternalLink />
                                </a>
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={rowBusy}
                              onClick={() => edit(rowId)}
                            >
                              <PenLine />
                              수정
                            </Button>
                            {!isDraft && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-destructive"
                                aria-label="휴지통으로 이동"
                                disabled={rowBusy}
                                onClick={() => void moveToTrash(post)}
                              >
                                <Trash2 />
                              </Button>
                            )}
                            {isDraft && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="초안 이어쓰기"
                                disabled={rowBusy}
                                onClick={() => edit(rowId)}
                              >
                                <ArrowRight />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {!loading && filtered.length > 0 && (
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
              <p className="text-xs text-muted-foreground">
                {filtered.length.toLocaleString('ko-KR')}개 중{' '}
                {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString('ko-KR')}–
                {Math.min(
                  currentPage * PAGE_SIZE,
                  filtered.length
                ).toLocaleString('ko-KR')}
                개 표시
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ArrowLeft />
                  이전
                </Button>
                <span className="min-w-16 text-center text-xs text-muted-foreground">
                  {currentPage} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage((value) => value + 1)}
                >
                  다음
                  <ArrowRight />
                </Button>
              </div>
            </footer>
          )}
        </section>
        <p className="mt-4 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <ArrowDownUp className="size-3.5" />
          최신순으로 정렬됩니다. 휴지통의 글은 7일 안에 복구할 수 있습니다.
        </p>
      </div>
    </main>
  );
}
