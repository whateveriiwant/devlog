import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { editorRequest as editorApi } from '../lib/editor-api';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import './write-editor.css';

const MAX_PREVIEW_CHARS = 100_000;

interface PostSummary {
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
  revision?: number;
  hasDraft?: boolean;
  deletedAt?: string;
}
interface Series {
  id: string;
  name: string;
  slug: string;
  description: string;
  originalUrl?: string;
}
interface Draft {
  id: string;
  title: string;
  revision?: number;
  baseRevision?: number;
}
interface Frontmatter extends Record<string, unknown> {
  title?: string;
  description?: string;
  slug?: string;
  publishedAt?: string;
  updatedAt?: string;
  tags?: string[];
  series?: { id: string; order?: number };
  thumbnail?: string;
  draft?: boolean;
}

function titleSlug(title: string) {
  return title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\\/?#%]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function optimizeImage(file: File) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return file;
  if (typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 300_000) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.84)
  );
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
    type: 'image/webp',
  });
}

export default function WriteEditor() {
  const [authorized, setAuthorized] = useState(false);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [trash, setTrash] = useState<PostSummary[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [source, setSource] = useState<Frontmatter>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [body, setBody] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [newSeriesName, setNewSeriesName] = useState('');
  const [newSeries, setNewSeries] = useState<Series | null>(null);
  const [panel, setPanel] = useState<'posts' | 'publish' | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const openedDeepLink = useRef(false);
  const savedContent = useRef('');
  const currentContent = JSON.stringify([
    title,
    description,
    tags,
    body,
    seriesId,
  ]);

  const autoSave = useEffectEvent(() => {
    if (
      busy ||
      uploads > 0 ||
      !title.trim() ||
      !body.trim() ||
      currentContent === savedContent.current
    )
      return;
    void save(false);
  });

  useEffect(() => {
    if (!authorized) return;
    const interval = window.setInterval(() => autoSave(), 60_000);
    return () => window.clearInterval(interval);
  }, [authorized]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const slug = titleSlug(title);
  const previewTooLong = body.length > MAX_PREVIEW_CHARS;
  const previewHtml = useMemo(
    () =>
      previewTooLong
        ? ''
        : DOMPurify.sanitize(marked.parse(body, { breaks: true }) as string),
    [body, previewTooLong]
  );

  async function loadD1Dashboard() {
    const result = await editorApi<{
      posts: PostSummary[];
      drafts: Draft[];
      series: Series[];
      trash: PostSummary[];
    }>('/posts');
    setPosts(result.posts);
    setTrash(result.trash);
    setDrafts(result.drafts);
    setSeries(result.series);
  }

  useEffect(() => {
    sessionStorage.removeItem('devlog-editor-token');
    // Loading starts after authentication; all updates happen after network I/O.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void (async () => {
      const session = await fetch('/api/auth/session', {
        credentials: 'same-origin',
      });
      if (!session.ok) {
        window.location.replace('/login/?next=%2Fwrite%2F');
        return;
      }
      const config = await fetch('/api/content/editor-config').then(
        (response) => {
          if (!response.ok)
            throw new Error('편집기 설정을 불러오지 못했습니다.');
          return response.json() as Promise<{
            enabled: boolean;
          }>;
        }
      );
      if (!config.enabled)
        throw new Error('D1 기반 편집기가 비활성화되어 있습니다.');
      await loadD1Dashboard();
      setAuthorized(true);
    })().catch(() => {
      window.location.replace('/login/?next=%2Fwrite%2F');
    });
    // Dashboard only needs to refresh after login or a successful save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authorized || openedDeepLink.current) return;
    const postId = new URLSearchParams(window.location.search).get('post');
    if (!postId) return;
    openedDeepLink.current = true;
    void openPost(postId);
    // Open a selected post only after the dashboard config has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  function reset() {
    savedContent.current = '';
    setId(null);
    setDraft(null);
    setSource({});
    setTitle('');
    setDescription('');
    setTags([]);
    setTagInput('');
    setBody('');
    setSeriesId('');
    setNewSeriesName('');
    setNewSeries(null);
    setPanel(null);
    setStatus('');
  }

  async function openPost(postId: string) {
    setBusy(true);
    try {
      const post = await editorApi<{
        id: string;
        title: string;
        slug: string;
        description: string;
        markdown: string;
        tags: string[];
        seriesId: string | null;
        newSeries: Series | null;
        thumbnail: string | null;
        revision: number;
        baseRevision: number;
        publishedAt: string | null;
        publishedRevision: number | null;
        isDraft: boolean;
      }>(`/posts/${encodeURIComponent(postId)}`);
      setId(post.id);
      savedContent.current = JSON.stringify([
        post.title,
        post.description,
        post.tags,
        post.markdown,
        post.seriesId ?? '',
      ]);
      setDraft(
        post.isDraft
          ? {
              id: post.id,
              title: post.title,
              revision: post.revision,
              baseRevision: post.baseRevision,
            }
          : null
      );
      setSource({
        title: post.title,
        slug: post.slug,
        description: post.description,
        publishedAt: post.publishedAt ?? undefined,
        revision: post.publishedRevision ?? 0,
      });
      setTitle(post.title);
      setDescription(post.description);
      setTags(post.tags);
      setBody(post.markdown);
      setSeriesId(post.seriesId ?? '');
      setNewSeries(post.newSeries);
      const draftSeries = post.newSeries;
      if (draftSeries)
        setSeries((current) =>
          current.some((item) => item.id === draftSeries.id)
            ? current
            : [...current, draftSeries]
        );
      setPanel(null);
      setStatus('');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addTag() {
    const value = tagInput.trim().replace(/^#/, '');
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setTagInput('');
  }

  function insertText(before: string, after = '', placeholder = '') {
    const element = editor.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    setBody(body.slice(0, start) + before + selected + after + body.slice(end));
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(
        start + before.length,
        start + before.length + selected.length
      );
    });
  }

  function createSeries() {
    const name = newSeriesName.trim();
    if (!name) return;
    if (series.some((item) => item.name === name)) {
      setStatus('이미 같은 이름의 시리즈가 있습니다.');
      return;
    }
    const next = {
      id: crypto.randomUUID(),
      name,
      slug: titleSlug(name),
      description: '',
    };
    setSeries((previous) => [...previous, next]);
    setNewSeries(next);
    setSeriesId(next.id);
    setNewSeriesName('');
    setStatus('');
  }

  function imageAtDrop(event: React.DragEvent<HTMLTextAreaElement>) {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const paddingTop = Number.parseFloat(style.paddingTop);
    const line = Math.max(
      0,
      Math.floor(
        (event.clientY - rect.top - paddingTop + element.scrollTop) / lineHeight
      )
    );
    const lines = body.split('\n');
    let offset = 0;
    for (let index = 0; index < Math.min(line, lines.length); index++) {
      offset += lines[index].length + 1;
    }
    return offset;
  }

  async function uploadImage(file: File, at: number) {
    if (
      ![
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
        'image/avif',
      ].includes(file.type)
    ) {
      setStatus('PNG, JPEG, WebP, GIF, AVIF 이미지만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus('이미지는 10MB 이하여야 합니다.');
      return;
    }
    const marker = `![업로드 중: ${file.name}](uploading-${crypto.randomUUID()})`;
    setBody(
      (current) => current.slice(0, at) + marker + '\n' + current.slice(at)
    );
    setUploads((count) => count + 1);
    setStatus('이미지를 R2에 업로드하고 있습니다…');
    try {
      const optimized = await optimizeImage(file);
      const response = await fetch('/api/content/editor/media', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': optimized.type,
        },
        body: optimized,
      });
      const result = (await response.json()) as {
        error?: string;
        url?: string;
      };
      if (!response.ok) throw new Error(result.error ?? '이미지 업로드 실패');
      if (!result.url) throw new Error('업로드 응답에 이미지 주소가 없습니다.');
      const url = result.url;
      const name = file.name
        .replace(/\.[^.]+$/, '')
        .replaceAll('[', '')
        .replaceAll(']', '');
      setBody((current) => current.replace(marker, `![${name}](${url})`));
      setStatus('이미지가 R2에 업로드되었습니다.');
    } catch (error) {
      setBody((current) => current.replace(marker + '\n', ''));
      setStatus((error as Error).message);
    } finally {
      setUploads((count) => count - 1);
    }
  }

  async function save(publish: boolean) {
    if (busy) return;
    if (!title.trim() || !body.trim()) {
      setStatus('제목과 본문을 입력해 주세요.');
      return;
    }
    if (!slug) {
      setStatus('제목으로 주소를 만들 수 없습니다.');
      return;
    }
    if (uploads) {
      setStatus('이미지 업로드가 끝난 뒤 저장해 주세요.');
      return;
    }
    const duplicate = posts.find(
      (post) => post.slug === slug && post.id !== id
    );
    if (duplicate) {
      setStatus('같은 주소를 쓰는 글이 있습니다. 제목을 바꿔 주세요.');
      return;
    }
    const clickedAt = new Date().toISOString();
    const thumbnail =
      new DOMParser()
        .parseFromString(previewHtml, 'text/html')
        .querySelector('img')
        ?.getAttribute('src') ?? null;
    setBusy(true);
    setStatus(publish ? '발행 준비 중…' : '초안 저장 중…');
    try {
      const postId = id ?? crypto.randomUUID();
      setId(postId);
      const expectedRevision = draft?.revision ?? 0;
      const baseRevision = draft?.baseRevision ?? Number(source.revision ?? 0);
      const result = await editorApi<{
        id: string;
        revision: number;
        baseRevision?: number;
        publishedAt?: string;
        updatedAt?: string;
        url?: string;
      }>('/posts', {
        method: 'POST',
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          operation: publish ? 'publish' : 'save',
          id: postId,
          title: title.trim(),
          slug,
          description: description.trim(),
          markdown: body.trimEnd(),
          tags,
          seriesId: seriesId || null,
          newSeries,
          thumbnail,
          expectedRevision,
          baseRevision,
        }),
      });
      setId(postId);
      setSource((current) => ({
        ...current,
        title: title.trim(),
        slug,
        description: description.trim(),
        tags,
        series: seriesId ? { id: seriesId } : undefined,
        thumbnail: thumbnail ?? undefined,
        publishedAt: result.publishedAt ?? current.publishedAt,
        updatedAt: result.updatedAt ?? current.updatedAt,
        revision: result.revision,
      }));
      savedContent.current = currentContent;
      if (publish) {
        setDraft(null);
        setDrafts((current) => current.filter((item) => item.id !== postId));
        setPosts((current) => [
          {
            id: postId,
            title: title.trim(),
            slug,
            publishedAt: result.publishedAt ?? clickedAt,
            revision: result.revision,
          },
          ...current.filter((item) => item.id !== postId),
        ]);
        if (newSeries) {
          setSeries((current) =>
            current.some((item) => item.id === newSeries.id)
              ? current
              : [...current, newSeries]
          );
          setNewSeries(null);
        }
        setPanel(null);
        setStatus(`발행했습니다. 공개 URL: ${result.url}`);
        return;
      }
      const nextDraft = {
        id: postId,
        title: title.trim(),
        revision: result.revision,
        baseRevision,
      };
      setDraft(nextDraft);
      setDrafts((current) => [
        nextDraft,
        ...current.filter((item) => item.id !== postId),
      ]);
      setStatus(
        '초안을 D1에 저장했습니다. 공개 글에는 아직 반영되지 않았습니다.'
      );
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveToTrash() {
    if (!id || !posts.some((post) => post.id === id)) return;
    setBusy(true);
    try {
      const result = await editorApi<{ id: string; deletedAt: string }>(
        `/posts/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ requestId: crypto.randomUUID() }),
        }
      );
      const deleted = posts.find((post) => post.id === result.id);
      setPosts((current) => current.filter((post) => post.id !== result.id));
      if (deleted)
        setTrash((current) => [
          { ...deleted, deletedAt: result.deletedAt },
          ...current.filter((post) => post.id !== result.id),
        ]);
      setPanel('posts');
      setStatus('글을 휴지통으로 이동했습니다. 언제든 복구할 수 있습니다.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromTrash(post: PostSummary) {
    setBusy(true);
    try {
      await editorApi(`/posts/${encodeURIComponent(post.id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      });
      setTrash((current) => current.filter((item) => item.id !== post.id));
      setPosts((current) => [
        post,
        ...current.filter((item) => item.id !== post.id),
      ]);
      setStatus(`“${post.title}” 글을 복구했습니다.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const visiblePosts = posts.filter((post) =>
    post.title.toLowerCase().includes(search.toLowerCase())
  );
  const visibleTrash = trash.filter((post) =>
    post.title.toLowerCase().includes(search.toLowerCase())
  );

  if (!authorized) return <p role="status">로그인 확인 중…</p>;

  return (
    <div className="write-shell">
      <main className="write-layout">
        <section className="write-pane" aria-label="마크다운 글쓰기">
          <div className="write-head">
            <button
              className="write-wordmark"
              onClick={() => setPanel('posts')}
            >
              devlog
            </button>
            <div className="write-head-actions">
              <a href="/admin/">글 관리</a>
              <button onClick={() => setPanel('posts')}>내 글</button>
              <button
                onClick={() => {
                  void fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                  }).finally(() => {
                    window.location.replace('/login/');
                  });
                }}
              >
                로그아웃
              </button>
            </div>
          </div>
          <div className="write-fields">
            <textarea
              className="write-title"
              aria-label="제목"
              placeholder="제목을 입력하세요"
              rows={1}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
            />
            <div className="write-title-rule" />
            <div className="write-tags">
              {tags.map((tag) => (
                <button
                  key={tag}
                  className="write-tag"
                  title="태그 삭제"
                  onClick={() => setTags(tags.filter((item) => item !== tag))}
                >
                  {tag} ×
                </button>
              ))}
              <input
                aria-label="태그 추가"
                placeholder="태그를 입력하고 Enter"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229
                  )
                    return;
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
              />
            </div>
            <div
              className="write-toolbar"
              role="toolbar"
              aria-label="마크다운 서식"
            >
              {(['H1', 'H2', 'H3', 'H4'] as const).map((level, index) => (
                <button
                  key={level}
                  title={level}
                  onClick={() =>
                    insertText('#'.repeat(index + 1) + ' ', '', '제목')
                  }
                >
                  {level}
                </button>
              ))}
              <span className="write-toolbar-line" />
              <button
                title="굵게"
                onClick={() => insertText('**', '**', '굵은 글씨')}
              >
                <strong>B</strong>
              </button>
              <button
                title="기울임"
                onClick={() => insertText('*', '*', '기울임')}
              >
                <em>I</em>
              </button>
              <button
                title="취소선"
                onClick={() => insertText('~~', '~~', '취소선')}
              >
                <s>S</s>
              </button>
              <button
                title="인용문"
                onClick={() => insertText('> ', '', '인용문')}
              >
                ❞
              </button>
              <button
                title="링크"
                onClick={() => insertText('[', '](https://)', '링크 텍스트')}
              >
                🔗
              </button>
              <button
                title="이미지"
                onClick={() => imageInput.current?.click()}
              >
                ▣
              </button>
              <button
                title="코드 블록"
                onClick={() => insertText('\n```\n', '\n```\n', '코드')}
              >
                〈〉
              </button>
              <input
                ref={imageInput}
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file)
                    void uploadImage(file, editor.current?.selectionStart ?? 0);
                  event.target.value = '';
                }}
              />
            </div>
            <div className={`write-body-wrap ${dragging ? 'is-dragging' : ''}`}>
              <textarea
                ref={editor}
                className="write-body"
                aria-label="마크다운 본문"
                placeholder={
                  '당신의 이야기를 적어보세요…\n\n이미지를 여기에 끌어다 놓을 수 있습니다.'
                }
                value={body}
                wrap="off"
                onChange={(event) => setBody(event.target.value)}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes('Files')) {
                    event.preventDefault();
                    setDragging(true);
                  }
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const files = Array.from(event.dataTransfer.files);
                  const at = imageAtDrop(event);
                  files.forEach((file) => void uploadImage(file, at));
                }}
                onPaste={(event) => {
                  const image = Array.from(event.clipboardData.files).find(
                    (file) => file.type.startsWith('image/')
                  );
                  if (!image) return;
                  event.preventDefault();
                  void uploadImage(image, event.currentTarget.selectionStart);
                }}
              />
              {dragging && (
                <div className="write-drop-hint">이 줄에 이미지를 놓으세요</div>
              )}
            </div>
          </div>
          <footer className="write-footer">
            <a href="/">← 나가기</a>
            <div className="write-footer-actions">
              <button
                className="write-mobile-preview"
                onClick={() => setPreview(!preview)}
              >
                {preview ? '편집' : '미리보기'}
              </button>
              <button
                disabled={busy || uploads > 0}
                onClick={() => void save(false)}
              >
                임시저장
              </button>
              {id && posts.some((post) => post.id === id) && (
                <button disabled={busy || uploads > 0} onClick={moveToTrash}>
                  휴지통으로
                </button>
              )}
              <button
                className="write-publish-button"
                disabled={busy || uploads > 0}
                onClick={() => setPanel('publish')}
              >
                {busy ? '처리 중…' : '출간하기'}
              </button>
            </div>
          </footer>
        </section>
        <section
          className={`write-preview ${preview ? 'is-visible' : ''}`}
          aria-label="글 미리보기"
        >
          <div className="write-preview-content">
            {title ? (
              <h1>{title}</h1>
            ) : (
              <p className="write-preview-placeholder">미리보기</p>
            )}
            {tags.length > 0 && (
              <div className="write-preview-tags">
                {tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            {previewTooLong ? (
              <p className="write-preview-placeholder">
                본문이 100,000자를 넘어 미리보기를 생략했습니다. 임시저장과
                출간은 계속할 수 있습니다.
              </p>
            ) : (
              <div
                className="write-markdown"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>
        </section>
      </main>
      {status && (
        <div className="write-status" role="status">
          {status}
        </div>
      )}
      {panel && (
        <div
          className="write-modal-backdrop"
          onMouseDown={() => setPanel(null)}
        >
          <section
            className="write-modal"
            role="dialog"
            aria-modal="true"
            aria-label={panel === 'posts' ? '내 글' : '출간 설정'}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="write-modal-head">
              <h2>{panel === 'posts' ? '내 글' : '출간 설정'}</h2>
              <button aria-label="닫기" onClick={() => setPanel(null)}>
                ×
              </button>
            </div>
            {panel === 'posts' ? (
              <>
                <button className="write-new-post" onClick={reset}>
                  + 새 글 쓰기
                </button>
                <input
                  className="write-search"
                  placeholder="글 제목 검색"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="write-post-list">
                  {drafts.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => void openPost(item.id)}
                    >
                      <span className="write-draft-badge">초안</span>{' '}
                      {item.title}
                    </button>
                  ))}
                  {visiblePosts.map((post) => (
                    <button
                      key={post.id}
                      onClick={() => void openPost(post.id)}
                    >
                      <strong>{post.title}</strong>
                      <small>
                        {new Date(post.publishedAt).toLocaleDateString('ko-KR')}
                      </small>
                    </button>
                  ))}
                  {visibleTrash.length > 0 && (
                    <div className="write-trash-list" aria-label="휴지통">
                      <h3>휴지통</h3>
                      {visibleTrash.map((post) => (
                        <div className="write-trash-row" key={post.id}>
                          <span>
                            <strong>{post.title}</strong>
                            <small>
                              삭제{' '}
                              {new Date(
                                post.deletedAt || ''
                              ).toLocaleDateString('ko-KR')}
                            </small>
                          </span>
                          <button
                            disabled={busy}
                            onClick={() => void restoreFromTrash(post)}
                          >
                            복구
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="write-publish-form">
                <label>
                  글 설명
                  <textarea
                    rows={3}
                    value={description}
                    placeholder="목록과 검색 결과에 표시할 설명"
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <label>
                  주소
                  <output>/blog/{slug || '제목'}/</output>
                </label>
                <label>
                  시리즈
                  <select
                    value={seriesId}
                    onChange={(event) => setSeriesId(event.target.value)}
                  >
                    <option value="">시리즈 없음</option>
                    {series.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="write-create-series">
                  <input
                    placeholder="새 시리즈 이름"
                    value={newSeriesName}
                    onChange={(event) => setNewSeriesName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        createSeries();
                      }
                    }}
                  />
                  <button onClick={createSeries}>시리즈 만들기</button>
                </div>
                <div className="write-modal-actions">
                  <button onClick={() => setPanel(null)}>돌아가기</button>
                  <button
                    className="write-publish-button"
                    disabled={busy || uploads > 0}
                    onClick={() => void save(true)}
                  >
                    {busy ? '발행 중…' : '출간하기'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
