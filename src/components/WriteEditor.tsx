import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import YAML from 'yaml';
import './write-editor.css';

const API = 'https://api.github.com/repos/whateveriiwant/devlog';
const AUTH = 'https://cms-api.seungjun.sh';
const POST_PATH = 'src/content/posts';
const SERIES_PATH = 'src/content/series.json';

interface PostSummary {
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
}
interface Series {
  id: string;
  name: string;
  slug: string;
  description: string;
  originalUrl?: string;
}
interface Draft {
  number: number;
  branch: string;
  id: string;
  title: string;
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

// The caller supplies the expected shape for these fixed API endpoints.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function titleSlug(title: string) {
  return title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\\/?#%]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0))
  );
}

function parsePost(source: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) throw new Error('글의 frontmatter를 읽을 수 없습니다.');
  return {
    data: YAML.parse(match[1]) as Frontmatter,
    body: source.slice(match[0].length),
  };
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

export default function WriteEditor({
  posts: initialPosts,
  initialSeries,
}: {
  posts: PostSummary[];
  initialSeries: Series[];
}) {
  const [token, setToken] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (sessionStorage.getItem('devlog-editor-token') ?? '')
  );
  const [posts, setPosts] = useState(initialPosts);
  const [series, setSeries] = useState(initialSeries);
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
  const [thumbnail, setThumbnail] = useState('');
  const [panel, setPanel] = useState<'posts' | 'publish' | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const tokenRef = useRef(token);

  const slug = titleSlug(title);
  const previewHtml = useMemo(
    () => DOMPurify.sanitize(marked.parse(body, { breaks: true }) as string),
    [body]
  );

  function authenticate() {
    return new Promise<string>((resolve, reject) => {
      const popup = window.open(
        `${AUTH}/auth`,
        'devlog-github-login',
        'width=620,height=720'
      );
      if (!popup) {
        reject(new Error('로그인 팝업을 열 수 없습니다.'));
        return;
      }
      const timeout = window.setTimeout(() => {
        window.removeEventListener('message', receive);
        reject(new Error('로그인 시간이 초과되었습니다.'));
      }, 120_000);
      const receive = (event: MessageEvent) => {
        if (event.origin !== AUTH || event.source !== popup) return;
        if (event.data === 'authorizing:github') {
          popup.postMessage('authorizing:github', AUTH);
          return;
        }
        if (typeof event.data !== 'string') return;
        if (!event.data.startsWith('authorization:github:')) return;
        window.clearTimeout(timeout);
        window.removeEventListener('message', receive);
        popup.close();
        const result = event.data.slice('authorization:github:'.length);
        if (result.startsWith('success:')) {
          const received = parseJson<{ token: string }>(
            result.slice('success:'.length)
          ).token;
          resolve(received);
        } else {
          reject(new Error('GitHub 로그인에 실패했습니다.'));
        }
      };
      window.addEventListener('message', receive);
    });
  }

  async function github<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('Authorization', `Bearer ${tokenRef.current}`);
    headers.set('Content-Type', 'application/json');
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(
        error.message ?? `GitHub 요청 실패 (${String(response.status)})`
      );
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  }

  async function content(path: string, ref: string) {
    return github<{ sha: string; content: string }>(
      `/contents/${path}?ref=${encodeURIComponent(ref)}`
    );
  }

  async function loadDashboard() {
    const [seriesFile, openPulls] = await Promise.all([
      content(SERIES_PATH, 'main'),
      github<{ number: number; title: string; head: { ref: string } }[]>(
        '/pulls?state=open&per_page=100'
      ),
    ]);
    setSeries(parseJson<Series[]>(decodeBase64(seriesFile.content)));
    const ownPulls = openPulls.filter((pull) =>
      pull.head.ref.startsWith('cms/write/')
    );
    const loaded = await Promise.all(
      ownPulls.map(async (pull) => {
        const files = await github<{ filename: string }[]>(
          `/pulls/${String(pull.number)}/files?per_page=100`
        );
        const postFile = files.find((file) =>
          file.filename.startsWith(`${POST_PATH}/`)
        );
        if (!postFile) return null;
        return {
          number: pull.number,
          branch: pull.head.ref,
          id: postFile.filename
            .slice(POST_PATH.length + 1)
            .replace(/\.md$/, ''),
          title: pull.title.replace(/^글 초안: /, ''),
        };
      })
    );
    setDrafts(loaded.filter((item): item is Draft => item !== null));
  }

  useEffect(() => {
    if (!token) return;
    // Loading starts after authentication; all updates happen after network I/O.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard().catch((error: unknown) =>
      setStatus((error as Error).message)
    );
    // Dashboard only needs to refresh after login or a successful save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function login() {
    try {
      const received = await authenticate();
      tokenRef.current = received;
      sessionStorage.setItem('devlog-editor-token', received);
      setToken(received);
      setStatus('');
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  function reset() {
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
    setThumbnail('');
    setPanel(null);
    setStatus('');
  }

  async function openPost(postId: string, ref = 'main', selectedDraft?: Draft) {
    setBusy(true);
    try {
      const file = await content(`${POST_PATH}/${postId}.md`, ref);
      const parsed = parsePost(decodeBase64(file.content));
      if (
        parsed.data.series?.id &&
        !series.some((item) => item.id === parsed.data.series?.id)
      ) {
        const seriesFile = await content(SERIES_PATH, ref);
        setSeries(parseJson<Series[]>(decodeBase64(seriesFile.content)));
      }
      setId(postId);
      setDraft(selectedDraft ?? null);
      setSource(parsed.data);
      setTitle(parsed.data.title ?? '');
      setDescription(parsed.data.description ?? '');
      setTags(parsed.data.tags ?? []);
      setBody(parsed.body);
      setSeriesId(parsed.data.series?.id ?? '');
      setThumbnail(parsed.data.thumbnail ?? '');
      setNewSeries(null);
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

  async function uploadImage(file: File, at: number, cover = false) {
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
    if (!cover) {
      setBody(
        (current) => current.slice(0, at) + marker + '\n' + current.slice(at)
      );
    }
    setUploads((count) => count + 1);
    setStatus('이미지를 R2에 업로드하고 있습니다…');
    try {
      const optimized = await optimizeImage(file);
      const response = await fetch(`${AUTH}/media`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': optimized.type },
        body: optimized,
      });
      const result = (await response.json()) as {
        error?: string;
        url?: string;
      };
      if (!response.ok) throw new Error(result.error ?? '이미지 업로드 실패');
      if (!result.url) throw new Error('업로드 응답에 이미지 주소가 없습니다.');
      const url = result.url;
      if (cover) setThumbnail(url);
      else {
        const name = file.name
          .replace(/\.[^.]+$/, '')
          .replaceAll('[', '')
          .replaceAll(']', '');
        setBody((current) => current.replace(marker, `![${name}](${url})`));
      }
      setStatus('이미지가 R2에 업로드되었습니다.');
    } catch (error) {
      if (!cover) setBody((current) => current.replace(marker + '\n', ''));
      setStatus((error as Error).message);
    } finally {
      setUploads((count) => count - 1);
    }
  }

  async function putFile(path: string, branch: string, value: string) {
    let sha: string | undefined;
    try {
      sha = (await content(path, branch)).sha;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Not Found')) {
        throw error;
      }
    }
    return github<{ commit: { sha: string } }>(`/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `docs: update ${path.split('/').at(-1) ?? path}`,
        content: encodeBase64(value),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  async function save(publish: boolean) {
    if (!tokenRef.current) {
      setStatus('먼저 GitHub에 로그인해 주세요.');
      return;
    }
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
    setBusy(true);
    setStatus(publish ? '발행 준비 중…' : '초안 저장 중…');
    try {
      const postId = id ?? crypto.randomUUID();
      let branch = draft?.branch;
      if (!branch) {
        const main = await github<{ object: { sha: string } }>(
          '/git/ref/heads/main'
        );
        branch = `cms/write/${postId}-${String(Date.now())}`;
        await github('/git/refs', {
          method: 'POST',
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: main.object.sha,
          }),
        });
      }
      if (newSeries) {
        const file = await content(SERIES_PATH, branch);
        const currentSeries = parseJson<Series[]>(decodeBase64(file.content));
        if (!currentSeries.some((item) => item.id === newSeries.id)) {
          currentSeries.push(newSeries);
          await putFile(
            SERIES_PATH,
            branch,
            JSON.stringify(currentSeries, null, 2) + '\n'
          );
        }
      }
      const now = clickedAt;
      const data: Frontmatter = {
        ...source,
        title: title.trim(),
        description: description.trim(),
        slug,
        publishedAt: source.publishedAt ?? now,
        ...(publish ? { updatedAt: now } : {}),
        tags,
        draft: !publish,
      };
      if (publish && !posts.some((post) => post.id === postId)) {
        data.publishedAt = now;
      }
      if (!data.updatedAt && publish) data.updatedAt = now;
      if (seriesId) data.series = { id: seriesId };
      else delete data.series;
      if (thumbnail) data.thumbnail = thumbnail;
      else delete data.thumbnail;
      const document = `---\n${YAML.stringify(data, { lineWidth: 0 })}---\n${body.trimEnd()}\n`;
      await putFile(`${POST_PATH}/${postId}.md`, branch, document);

      let pullNumber = draft?.number;
      if (!pullNumber) {
        const pull = await github<{ number: number }>('/pulls', {
          method: 'POST',
          body: JSON.stringify({
            title: `글 초안: ${title.trim()}`,
            head: branch,
            base: 'main',
            body: '글쓰기 화면에서 작성한 글입니다.',
          }),
        });
        pullNumber = pull.number;
      }
      const nextDraft = { number: pullNumber, branch, id: postId, title };
      setId(postId);
      setDraft(nextDraft);
      setSource(data);
      setNewSeries(null);
      if (!publish) {
        setDrafts((current) => [
          nextDraft,
          ...current.filter((item) => item.number !== pullNumber),
        ]);
        setStatus(
          '초안을 저장했습니다. 발행 전까지 사이트에 표시되지 않습니다.'
        );
        return;
      }
      setStatus('검사 완료를 기다린 뒤 PR을 병합합니다…');
      for (let attempt = 0; attempt < 48; attempt++) {
        try {
          await github(`/pulls/${String(pullNumber)}/merge`, {
            method: 'PUT',
            body: JSON.stringify({ merge_method: 'squash' }),
          });
          setDraft(null);
          setDrafts((current) =>
            current.filter((item) => item.number !== pullNumber)
          );
          setPosts((current) => [
            { id: postId, title, slug, publishedAt: data.publishedAt ?? now },
            ...current.filter((item) => item.id !== postId),
          ]);
          setPanel(null);
          setStatus('발행했습니다. 사이트 빌드가 끝나면 목록에 표시됩니다.');
          return;
        } catch (error) {
          const message = (error as Error).message;
          if (
            !/merge|status|checks|405|not mergeable/i.test(message) ||
            attempt === 47
          ) {
            throw new Error(
              `PR #${String(pullNumber)} 발행 대기 중: ${message}. GitHub에서 확인해 주세요.`,
              { cause: error }
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const visiblePosts = posts.filter((post) =>
    post.title.toLowerCase().includes(search.toLowerCase())
  );

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
              <button onClick={() => setPanel('posts')}>내 글</button>
              {token ? (
                <button
                  onClick={() => {
                    sessionStorage.removeItem('devlog-editor-token');
                    tokenRef.current = '';
                    setToken('');
                  }}
                >
                  로그아웃
                </button>
              ) : (
                <button onClick={login}>GitHub 로그인</button>
              )}
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
                  #{tag} ×
                </button>
              ))}
              <input
                aria-label="태그 추가"
                placeholder="태그를 입력하고 Enter"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
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
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
            <div
              className="write-markdown"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
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
                {!token && (
                  <button className="write-login-hint" onClick={login}>
                    GitHub 로그인하여 글 불러오기
                  </button>
                )}
                <input
                  className="write-search"
                  placeholder="글 제목 검색"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="write-post-list">
                  {drafts.map((item) => (
                    <button
                      key={item.number}
                      onClick={() => void openPost(item.id, item.branch, item)}
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
                <div className="write-cover">
                  <span>썸네일</span>
                  {thumbnail && <img src={thumbnail} alt="썸네일 미리보기" />}
                  <label className="write-cover-upload">
                    이미지 선택
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadImage(file, 0, true);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  {thumbnail && (
                    <button onClick={() => setThumbnail('')}>제거</button>
                  )}
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
