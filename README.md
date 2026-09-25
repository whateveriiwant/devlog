# seungjun.dev

Velog `@jsj9620`의 공개 글 125개와 시리즈 23개를 이전한 Astro 정적 블로그입니다. 원본 본문은 Markdown 파일로 보존하고, 큰 카테고리·기존 시리즈·태그·연도별 아카이브·본문 검색으로 탐색합니다.

이미지는 현재 원래 URL을 사용합니다. R2 계정과 개인 도메인이 정해지면 `migration/deployment.md` 순서로 이전할 수 있습니다. 실제 GitHub 저장소 생성·push, Cloudflare 배포, 이미지 다운로드·업로드는 수행하지 않았습니다.

## 실행

검증에 사용한 환경은 Node.js **24.12.0**, pnpm **10.28.0**입니다. `.node-version`, `packageManager`, `pnpm-lock.yaml`을 함께 유지합니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

코드·스타일·Markdown 수정은 개발 서버에서 바로 반영됩니다. 환경변수나 Markdown 처리 plugin을 바꾸면 서버를 재시작하세요. 개발 서버 시작과 빌드는 `--force`로 콘텐츠 캐시를 갱신하므로 처리 규칙이나 R2 URL 매핑 변경이 이전 캐시에 가려지지 않습니다. Pagefind는 **빌드된 HTML**을 색인하므로 검색을 포함한 전체 미리보기는 다음 명령을 사용합니다.

```sh
pnpm build
pnpm preview
```

터미널에 표시된 로컬 주소를 여세요. 4321 포트를 이미 사용 중이면 다른 포트가 선택될 수 있습니다. 개발 서버를 종료한 뒤 preview를 실행하면 같은 포트를 사용할 수 있습니다. 글을 고친 뒤 검색 결과까지 갱신하려면 다시 빌드합니다.

환경변수는 없어도 실행됩니다. 실제 도메인이 없을 때는 canonical과 sitemap을 생성하지 않고 검색엔진에는 `noindex`를 지정합니다. RSS의 로컬 개발용 origin은 `http://localhost:4321`입니다. 이것을 공개 주소로 사용하지 않습니다.

## 검증

```sh
pnpm check
pnpm verify:migration
pnpm build
pnpm verify:build
pnpm verify:search
```

| 명령               | 검증 내용                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `check`            | Astro/TypeScript 타입·컴포넌트 진단                                                        |
| `verify:migration` | 125개 원본 본문 SHA-256, 제목·날짜·태그·시리즈 ID/원래 순서, Markdown 구조                 |
| `verify:build`     | 실제 HTML의 제목·heading·이미지·코드, 내부 경로/목차 anchor, 아카이브 전체 글, 시리즈 순서 |
| `verify:search`    | 생성된 Pagefind JS/WASM에서 전체 125개 검색 문서와 metadata, 한국어·영어·과거 글 검색      |

검증 결과는 `migration/verification.json`, `build-verification.json`, `search-verification.json`에 저장됩니다. 코드 렌더링 비교는 Shiki와 기본 HTML 렌더러의 **블록 끝 줄바꿈** 차이만 정규화합니다. 들여쓰기·내부 줄바꿈은 그대로 비교하며, 원본 Markdown 전체 바이트 비교는 별도로 통과해야 합니다.

이 검증은 이전 당시의 snapshot과 비교하는 감사 도구입니다. 향후 이전된 글을 직접 편집하면 해당 원문 비교가 실패하는 것이 정상입니다. 새 글을 추가한 이후 전체 글 수가 달라지면 검색/아카이브 감사 기준도 갱신해야 합니다. 일반 글쓰기에는 `check`와 `build`를 사용하세요.

## 구조와 수정 위치

| 위치                                   | 역할                                                          |
| -------------------------------------- | ------------------------------------------------------------- |
| `src/content/posts/`                   | 이전한 글 125개의 `.md`; 새 글은 `.md` 또는 `.mdx`            |
| `src/content/series.json`              | 기존 23개 시리즈의 ID·이름·slug                               |
| `src/content.config.ts`                | Content Collections schema와 파일 loader                      |
| `src/lib/content.ts`                   | 날짜·태그 별칭·카테고리·시리즈·URL 처리                       |
| `src/layouts/BaseLayout.astro`         | 전체 레이아웃·반응형 3열·React island 배치·SEO                |
| `src/layouts/ArticleLayout.astro`      | 글 metadata·시리즈 이전/다음·관련 글·TOC 배치                 |
| `src/components/PostList.astro`        | 날짜와 제목 중심의 조밀한 목록; Tailwind utility로 간격 수정  |
| `src/components/NavigationPanel.tsx`   | 5개 카테고리와 글별 시리즈 탐색                               |
| `src/components/TableOfContents.astro` | 실제 heading 기반 목차와 깊은 단계 접기                       |
| `src/components/Photo.astro`           | 사진·caption·수동 촬영 정보·responsive image 속성             |
| `src/components/SiteControls.tsx`      | shadcn 검색·모바일 메뉴·테마·이미지 확대                      |
| `src/components/Expandable.tsx`        | shadcn 연도·목차 접기                                         |
| `src/components/ui/`                   | 공식 CLI로 추가한 shadcn/ui 컴포넌트 소스                     |
| `src/scripts/ui.ts`                    | 스크롤에 따른 현재 목차 표시                                  |
| `src/styles/global.css`                | 색상 변수·테마·Markdown typography·공통 요소 스타일           |
| `src/pages/`                           | 홈·아카이브·시리즈·카테고리·태그·글·RSS·robots·404            |
| `scripts/rehype-content.mjs`           | 안전한 HTML 렌더링, heading 단계, 내부 링크와 이미지 URL 매핑 |
| `migration/taxonomy.json`              | 실제 자료에서 결정한 5개 영역과 글별 분류, 태그 표시 별칭     |

전체 배치와 목록의 반응형 크기는 Astro의 Tailwind utility를 수정합니다. 본문에서 자동 생성되는 `p`, `h2`, `pre`, `table` 등의 스타일과 색상은 `global.css`를 수정합니다. 2026-09-12 요청에 따라 UI를 shadcn/ui (new-york, Neutral)로 전환했습니다. React 19.3.0과 Astro React integration 6.0.5를 사용합니다. Sidebar·Item·Badge·Breadcrumb는 서버에서 HTML로 렌더링하고, 검색·모바일 메뉴·이미지 확대·테마·접기만 React island로 동작합니다.

컴포넌트는 `src/components/ui/`, 테마는 `src/styles/global.css`, CLI 설정은 `components.json`에서 수정합니다. 정적 링크에는 공식 `buttonVariants`·`badgeVariants`도 사용합니다. Markdown 본문은 원본 구조를 보존하며 같은 테마 토큰으로 표시합니다. [공식 Astro 연동 안내](https://ui.shadcn.com/docs/installation/astro) · [테마 안내](https://ui.shadcn.com/docs/theming)

## 새 글 작성

[`https://seungjun.sh/admin/`](https://seungjun.sh/admin/)에서 GitHub로 로그인해 글을 작성합니다. 이미지 버튼으로 R2에 올리고, 초안 저장은 CMS가 PR을 만듭니다. 발행 버튼은 PR을 병합해 `main`의 자동 배포를 시작합니다. `draft`를 켜면 발행 후에도 비공개입니다. 설정 기록은 [`docs/writing-workflow-decisions.md`](docs/writing-workflow-decisions.md)에 있습니다.

`src/content/posts/`에 파일을 만듭니다. 이전 파일 이름은 Velog UUID를 유지하지만 새 글은 읽기 쉬운 파일 이름을 사용해도 됩니다. 실제 URL은 frontmatter의 `slug`로 결정됩니다.

```yaml
---
title: '새 글 제목'
description: '글을 한두 문장으로 설명합니다.'
slug: 'my-new-post'
publishedAt: '2026-09-08T09:00:00+09:00'
tags:
  - JavaScript
draft: true
---
```

위 값은 작성 형식 예시입니다. 본문은 `##` 이하로 작성하세요. 기존 Velog 본문에 h1이 있는 경우에만 렌더러가 본문 heading을 한 단계 낮춰 글 제목의 h1과 구별합니다. 원본 파일은 변경하지 않습니다. `draft: true`이면 글 목록·상세 페이지·검색·RSS에서 제외됩니다. 공개할 때 `false`로 변경합니다.

시리즈에 속하는 새 글은 `series: { id: "실제 시리즈 ID", order: 양의 정수 }` 형태로 추가합니다. 정확한 ID는 `src/content/series.json`에서 가져오고, 해당 시리즈에서 중복되지 않는 순서를 사용합니다. 새 시리즈는 이 JSON에 새 항목을 먼저 추가합니다. 원문이 없는 새 글에는 `originalUrl`이 필요하지 않습니다.

태그 원문을 삭제하지 않고 탐색 단계에서만 별칭을 적용합니다. 예를 들어 `cpp`는 `C++`로, `node.js`는 `Node.js`로 표시합니다. 170개의 원본 태그가 166개의 탐색 태그로 정리되어 있습니다. `CI/CD`처럼 `/`가 있는 태그는 안전한 경로로 바꿉니다.

## MDX와 사진

`.mdx` 글에서는 다음과 같이 import하여 사용합니다. `src`에는 자신이 업로드한 실제 공개 이미지 URL을 지정하세요.

```mdx
import Photo from '../../components/Photo.astro';

<Photo
  src="실제 공개 이미지 URL"
  alt="사진의 핵심 내용을 설명하는 문장"
  caption="필요한 경우 사진 설명"
  width={1600}
  height={1067}
/>
```

폭·높이는 실제 이미지 크기를 넣으세요. `camera`, `lens`, `focalLength`, `shutter`, `aperture`, `iso`는 입력한 촬영 정보를 표시합니다. EXIF를 자동 추출하지 않습니다. 다른 해상도의 파일을 준비한 경우 `srcset`과 `sizes`를 전달할 수 있습니다. 이미지 변환 서버나 자동 썸네일 생성은 포함하지 않았습니다.

사진은 lazy loading을 사용하며 클릭·키보드로 확대할 수 있습니다. 원래 다른 페이지로 연결되는 이미지 링크는 기존 링크 동작을 유지합니다. 누락된 alt는 실제 사진을 본 뒤 작성해야 하므로 자동 추측으로 채우지 않았습니다.

## 검색 동작

검색 버튼, `⌘K`, `Ctrl+K`로 열고, 화살표·Enter·Esc로 이동합니다. 결과에는 제목·설명·카테고리·시리즈·태그·날짜가 표시됩니다. 검색할 때 필요한 정적 index를 불러옵니다.

Pagefind 기본 부분 일치 검색을 사용합니다. 정확한 문장은 큰따옴표로 감싸서 검색할 수 있습니다. 이번 검증에서 따옴표 없는 긴 무작위 문자열이 짧은 토큰과 부분 일치하는 사례가 있었으므로, 결과가 너무 넓으면 더 구체적인 검색어나 정확한 문장을 사용하세요. 한국어 어간 변화까지 동일하게 처리하는 검색은 지원하지 않습니다. [Pagefind 언어 지원](https://pagefind.app/docs/multilingual/)

## 이전 스크립트 재실행

일반 빌드는 Velog API를 호출하지 않습니다. 이미 수집된 snapshot만으로 Markdown과 HTML을 만들 수 있습니다.

```sh
pnpm analyze
pnpm migrate
pnpm verify:migration
```

`migrate`는 모든 대상 파일을 먼저 확인하며, 이전 실행 후 사용자가 수정한 글이 있으면 덮어쓰기 전에 중단합니다. 자동으로 로컬 편집을 버리거나 원본에서 사라진 글을 삭제하지 않습니다. `file-manifest.json`도 함께 보존하세요.

다시 Velog에서 공개 자료를 수집해야 할 때만 `pnpm collect`를 실행합니다. Python 3와 curl이 필요하며, 공개 API의 목록/시리즈를 다시 읽고 글 ID와 `updated_at` 기준으로 상세 응답 캐시를 사용합니다. `migration/` snapshot을 갱신하므로 기존 상태를 Git에 저장한 후 실행하세요. 새 글이 있으면 taxonomy의 글별 카테고리를 검토한 다음 migrate를 실행해야 합니다. 공개 API가 바뀌면 collector를 수정해야 하지만 이미 이전한 글의 빌드는 영향을 받지 않습니다.

## 보고서와 배포

- `docs/writing-workflow-decisions.md`: 글쓰기 편집기·R2 이미지 첨부·7일 유예 정리의 결정 사항과 외부 서비스 연결 절차
- `migration/analysis.md`: 실제 글·태그·날짜·시리즈 분포와 IA 결정 근거
- `migration/manual-review.md`: 원본 HTML, 빈 alt, 코드 언어 누락 등 편집 확인 목록
- `migration/completion.md`: 구현 범위와 최종 검증 결과
- `migration/deployment.md`: GitHub, Cloudflare Pages, R2, 도메인, SEO 전환 순서

원문: [전체 글](https://velog.io/@jsj9620/posts), [전체 시리즈](https://velog.io/@jsj9620/series). 수집 시각은 `migration/collection.json`에 보존되어 있습니다.
