# 글쓰기 워크플로 의사 결정 기록

- 기록일: 2026-09-25
- 상태: 구현·외부 서비스 연결·프로덕션 배포·GitHub 로그인 확인 완료

## 배경

현재 글은 `src/content/posts/`의 Markdown/MDX 파일로 관리한다. 글을 공개하려면 이미지 업로드, Git 커밋·푸시, PR 생성·병합을 따로 처리해야 한다. 사용자는 글쓰기 화면에서 이미지 첨부와 발행을 마치고 싶다.

현재 사이트는 Astro 정적 빌드에서 글 페이지, RSS, Pagefind 검색 색인을 만든다. `draft: true`인 글은 공개 글 목록과 상세 페이지 생성에서 제외된다. 관련 코드: [`src/content.config.ts`](../src/content.config.ts), [`src/lib/content.ts`](../src/lib/content.ts), [`src/pages/blog/[slug].astro`](../src/pages/blog/%5Bslug%5D.astro), [`package.json`](../package.json).

## 결정한 방향

1. **브라우저에서 글을 작성·미리보기·발행한다.** 작성자가 매번 커밋·푸시·PR 병합을 직접 하지 않는 흐름을 목표로 한다. Decap CMS는 기존 Markdown 파일을 다룰 수 있는 편집기 후보이다. CMS가 Git 작업을 대신하더라도 저장소의 커밋과 PR은 내부적으로 생길 수 있다. [Astro의 Decap CMS 안내](https://docs.astro.build/en/guides/cms/decap-cms/) · [Decap 발행 방식](https://decapcms.org/docs/editorial-workflows/)
2. **새 이미지도 R2에 보관하는 방향으로 진행한다.** 글쓰기 화면에서 첨부한 뒤 공개 이미지 주소를 본문과 썸네일에 넣는다. 새 이미지를 Git 저장소의 `public/uploads`에 쌓는 방안은 채택하지 않았다. Git에 넣은 이미지는 파일을 삭제해도 과거 커밋에 남는다. 기존 Velog 이미지 이전 로직은 별도로 다룬다.
3. **사용하지 않는 R2 이미지는 자동으로 정리한다.** 글 본문에서 이미지를 제거했다는 이유만으로 즉시 삭제하지 않는다. 다른 글·썸네일·초안에서 참조할 수 있기 때문이다. 정리 작업은 참조 여부를 확인하고 유예 기간이 지난 파일만 삭제하는 방향으로 설계한다. R2의 수명 주기 규칙은 파일 나이·경로를 기준으로 하므로 글의 참조 여부를 대신 판단하지 못한다. [R2 수명 주기 규칙](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)

## 확정한 설정과 구현

- **R2 업로드:** 자체 Cloudflare Worker를 사용한다. 편집기의 이미지 버튼은 R2에 직접 업로드하고, 본문·썸네일에 `https://media.seungjun.sh/posts/…` 주소를 넣는다. 업로드 Worker는 `devlog-assets` R2 바인딩을 사용한다. 기존 `velog/` 이미지는 변경하지 않는다.
- **7일 삭제 유예:** 매일 GitHub Actions가 모든 원격 브랜치의 글 본문·썸네일 참조를 검사한다. 참조가 없는 새 `posts/` 이미지를 발견하면 R2에 표식을 만들고, 계속 참조가 없는 상태로 7일이 지난 뒤 삭제한다. 다시 참조되면 표식을 지운다. 수동 실행은 기본적으로 미리보기이며 `--delete`일 때만 변경한다.
- **글 발행:** Decap CMS의 editorial workflow를 사용한다. 저장은 CMS가 초안 브랜치와 PR을 만들고, 발행은 PR을 병합한다. `draft: true`인 글은 발행 후에도 사이트에 나타나지 않는다.
- **실제 배포 연결:** 2026-09-25 Cloudflare 대시보드에서 확인했다. `devlog`는 정적 자산 Worker이며 GitHub `whateveriiwant/devlog`에 연결되어 있다. 프로덕션 브랜치는 `main`, 빌드 명령은 `pnpm run build`, 배포 명령은 `npx wrangler deploy`, 루트는 `/`이다. `MEDIA_BASE_URL=https://media.seungjun.sh`, `SITE_URL=https://seungjun.sh`, `ALLOW_INDEXING=true`가 빌드 변수다. 프로덕션 사이트의 사용자 도메인은 `seungjun.sh`이다. `main` 보호 규칙은 PR을 요구하며 승인은 요구하지 않는다. 상태 검사 요구 옵션은 켜져 있지만 필수 검사 목록은 비어 있다. 따라서 편집기 발행 후 `main` 자동 배포가 현재 연결에 가장 작은 변경이다.

구현 파일: [`public/admin/config.yml`](../public/admin/config.yml), [`public/admin/r2-media.js`](../public/admin/r2-media.js), [`worker/cms.mjs`](../worker/cms.mjs), [`wrangler.cms.jsonc`](../wrangler.cms.jsonc), [`scripts/cleanup-unused-images.mjs`](../scripts/cleanup-unused-images.mjs), [정리 워크플로](../.github/workflows/cleanup-unused-images.yml).

## 외부 서비스 연결

1. GitHub OAuth 앱 `devlog editor`를 등록했다. 홈페이지는 `https://seungjun.sh/admin/`, 콜백은 `https://cms-api.seungjun.sh/callback`이다. OAuth 요청 범위는 공개 저장소 쓰기가 가능한 `public_repo`다.
2. 별도 Worker `devlog-cms`에 R2 버킷 `devlog-assets`를 연결하고 `cms-api.seungjun.sh` 사용자 도메인으로 배포했다. `GITHUB_CLIENT_ID`는 일반 변수, `GITHUB_CLIENT_SECRET`과 `SESSION_SECRET`은 암호화된 Worker 비밀값으로 설정했다. 비밀값은 저장소에 넣지 않았다.
3. GitHub Actions 저장소 비밀값 `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`를 설정했다. 정리 워크플로는 GitHub 기본 브랜치 `dev`에서 매일 실행된다. R2 토큰은 `devlog-assets` 버킷의 객체 읽기·쓰기로 한정했다.
4. 구현 PR #6을 `main`에 병합했고, 기존 Cloudflare 연결이 편집기 정적 파일을 프로덕션에 배포했다. `https://seungjun.sh/admin/`에서 GitHub OAuth 로그인, 기존 글 목록, 새 글 화면, R2 이미지 선택창을 확인했다. 실제 글과 이미지를 생성하지는 않았다.

## 구현 중 확인한 주의점

- **초안:** CMS의 초안은 PR로 보관된다. `draft` 필드는 별도의 공개 여부 스위치다. 발행 전에 끄고 `publishedAt`을 입력한다. 미래 날짜 자동 예약 발행은 지원하지 않는다.
- **정리 범위:** CMS에서 새로 올린 `posts/` 키만 정리한다. 기존 `velog/`는 정리 대상이 아니다. R2에서 처음 참조 누락을 감지한 시점부터 7일을 센다.
- **편집 항목:** `category`는 스키마에 없으므로 편집기에 넣지 않았다. README의 오래된 안내는 실제 필드에 맞게 고친다.

## 편집기 사용성 개선 기록

다음 불편을 요청 순서대로 한 항목씩 개선한다.

1. **시리즈 선택 개선 — 완료:** 시리즈 ID 직접 입력을 없애고 23개 시리즈의 이름이 보이는 선택 메뉴로 바꿨다. 순서 입력은 `시리즈 내 글 순서`로 표시하고 설명을 추가했다.
2. **글쓰기 UI 개선 — 완료:** CMS에 밝은 배경, 또렷한 입력 상태, 부드러운 모서리와 브랜드 포인트 색을 적용해 편집 화면을 정돈했다.
3. **태그 입력 개선 — 완료:** 쉼표 구분 입력 대신 `태그 추가` 버튼으로 태그를 하나씩 넣고 뺄 수 있게 바꿨다.
4. **본문 이미지 삽입 개선 — 완료:** 본문 편집기에 `+` → `Image` 순서와 R2 업로드 안내를 표시한다.
5. **이미지 로딩 속도 조사 및 개선 — 완료:** CMS 스크립트는 `/admin/`에서만 불리고 공개 글의 이미지 경로는 R2다. 2026-09-25에 공개 이미지 7개를 확인했을 때 `Cache-Control: public, max-age=31536000, immutable`이 설정되어 있었고, 캐시 적중은 약 0.15~0.6초, 캐시 미스는 한 이미지에서 약 2.3초가 걸렸다. CMS 추가 커밋은 공개 이미지 렌더링 코드를 바꾸지 않았다. 새 JPEG/PNG 첨부는 브라우저에서 긴 변 2400px·WebP 품질 84로 줄이고, 결과가 더 작을 때만 최적화본을 올리도록 했다. GIF/AVIF와 기존 R2 파일은 변환하지 않는다. 현재 근거로는 CMS 자체가 공개 이미지 지연을 일으켰다고 확인할 수 없으며, 캐시가 비어 있는 첫 요청은 여전히 느릴 수 있다.

CMS API Worker 코드는 현재 대시보드에서 배포했다. 이후 Worker 코드를 바꾸면 `wrangler.cms.jsonc`로 별도 배포해야 한다.

## 2026-09-25: 벨로그형 글쓰기 화면

- 벨로그의 글쓰기 화면을 확인했다. 큰 제목과 태그 입력, 마크다운 도구막대, 좌측 입력·우측 미리보기, 하단 발행 버튼을 새 `/write/` 화면에 적용했다. `/admin/`은 이 화면으로 이동한다. 이전 Decap 화면은 `/admin/legacy.html`에 남겨 기존 CMS 초안을 열 수 있다.
- 본문은 마크다운 입력만 제공한다. 파일을 본문으로 끌어놓거나 붙여넣으면 해당 줄에 이미지 문법을 넣고 기존 인증 Worker를 통해 R2에 즉시 업로드한다. 파일 선택 버튼과 썸네일 업로드도 같은 Worker를 쓴다.
- 글 주소는 제목의 공백을 `-`로 바꿔 만든다. 다른 글과 주소가 겹치면 저장을 막는다. 제목을 바꿔 다시 발행하면 주소도 바뀐다.
- 첫 발행 때 `publishedAt`과 `updatedAt`을 발행 버튼을 누른 시각으로 기록한다. 이후 수정 발행은 `publishedAt`을 유지하고 `updatedAt`을 갱신한다. 초안 저장 시 들어간 임시 날짜는 첫 발행 때 바꾼다.
- 새 시리즈는 출간 설정에서 만들고, 글과 함께 같은 PR에 저장한다. 시리즈 선택은 JSON 목록을 GitHub에서 읽어 갱신한다.
- 시리즈의 수동 순서 입력과 정렬 전환 UI를 없앴다. 모든 시리즈 글은 발행 일시 최신순으로 표시한다. 기존 글의 `series.order` 데이터는 읽을 수 있지만 정렬에는 사용하지 않는다.
- 새 화면은 GitHub OAuth 토큰으로 초안 브랜치와 PR을 만들고, 발행 시 PR을 병합한다. 브랜치 보호 및 검사 완료를 기다리는 동안 발행 버튼은 진행 상태를 표시한다. 정적 사이트 배포가 끝나야 공개 목록에 나타난다.

구현 파일: [`src/pages/write.astro`](../src/pages/write.astro), [`src/components/WriteEditor.tsx`](../src/components/WriteEditor.tsx), [`src/components/write-editor.css`](../src/components/write-editor.css).
