# Velog 이전 구현 결과

기준: 2026-09-07T05:59:00.726652+00:00에 수집한 공개 snapshot. 최종 HTML 검증: 2026-09-12T03:47:22.218Z.

공개 글 125개와 시리즈 23개를 분석한 뒤 Astro 정적 블로그를 구현했다. 현재 디렉터리에 프로젝트 소스가 있고, `seungjun-blog-source.zip`에는 글·원본 inventory·코드·문서·검증 결과·lockfile을 포함했다.

## 조사와 보존

| 항목 | 결과 |
|---|---:|
| 공개 글 목록 / 원문 수집 / 이전 성공 | 125 / 125 / 125 |
| 이전 실패 / 중복 글 ID | 0 / 0 |
| 시리즈 | 23 |
| 시리즈 소속 / 미소속 글 | 124 / 1 |
| 원본 태그 / 탐색용 별칭 적용 태그 | 170 / 166 |
| 원본·이전 본문 heading | 1,046 / 1,046 |
| 원본·이전 본문 이미지 참조 | 238 / 238 |
| 원본·이전 코드 블록 | 282 / 282 |
| 썸네일 포함 이미지 참조 / 고유 URL | 353 / 271 |
| 생성한 HTML 페이지 | 325 |
| Pagefind 검색 문서 | 125 |
| 검증한 내부 링크·anchor 참조 | 14,046 |

각 글의 제목·설명·slug·발행/수정 시각·원래 태그·썸네일·series ID와 원래 index를 대조했다. 원본 본문과 생성된 Markdown 본문은 UTF-8 SHA-256이 동일하다. 원문의 목록·인용·링크·inline code·언어 식별자·HTML도 이 바이트 검증에 포함된다. 파일만 만들어 놓고 개수로 완료 처리한 것이 아니다.

정적 HTML에서도 실제 heading 텍스트/단계, 이미지 URL과 개수, 코드 내용을 비교했다. HTML 코드 비교는 렌더러별 블록 끝 LF 차이만 정규화하고, 내부 공백·줄바꿈은 정확히 비교한다. 원문 파일의 마지막 줄바꿈은 SHA-256 검증으로 그대로 보존했다.

## 실제 자료에 따라 선택한 IA

| 큰 탐색 영역 | 글 수 |
|---|---:|
| 웹·앱 개발 | 41 |
| 컴퓨터 기초 | 27 |
| 언어·문제 풀이 | 27 |
| 설계·개발 도구 | 8 |
| 경험·기록 | 22 |

원래 시리즈에 속한 글이 124/125개라서 시리즈의 의미와 순서를 유지했다. 1개 글에만 붙은 원본 태그가 114개여서 170개 태그를 Sidebar 최상위에 펼치는 대신 5개 영역 아래에서 찾게 했다. 원본 태그는 frontmatter에 남기고 표시 단계에서만 별칭을 적용했다.

연도별로 2025년 73개, 2024년 1개, 2023년 27개, 2022년 24개다. 홈은 최신 10개 행에 연도별 접근과 오래된 시리즈 시작 글을 함께 제공한다. 아카이브는 4개 연도와 실제 글이 있는 월을 표시하며 125개 글 모두가 정적 HTML에 존재한다. 큰 썸네일 카드를 나열하지 않는다.

Desktop은 왼쪽 콘텐츠/현재 시리즈 탐색, 중앙 본문, 오른쪽 TOC다. 모바일은 shadcn Sheet 탐색 메뉴와 본문 앞 Collapsible TOC로 바뀐다. TOC는 각 글의 최상위 두 단계 중심이며 더 깊은 단계는 접어 둔다. 본문에 h1이 있는 글만 화면에서 heading을 한 단계 낮추며, 원본 Markdown은 변경하지 않는다. 이전/다음 글은 원래 시리즈 순서, 관련 글은 태그 교집합과 카테고리를 기준으로 제시한다.

## 구현 범위와 주요 파일

| 파일/영역 | 구현 내용 |
|---|---|
| `migration/velog-posts.json`, `velog-series.json`, `velog-tags.json`, `collection.json` | 원본 전체 snapshot, 공개 API 요청문, 개수/시각/불일치 기록 |
| `migration/analysis.md`, `taxonomy.json`, `statistics.json`, `content-structure.json` | 실제 분포, 글별 분류, heading·코드·이미지 분석 |
| `scripts/collect-velog.py`, `analyze-content.mjs`, `migrate-velog.mjs` | 수집→분석→반복 가능한 이전, 사용자가 편집한 파일 덮어쓰기 방지 |
| `src/content/posts/`, `src/content/series.json`, `src/content.config.ts` | Markdown 125개, 시리즈 23개, schema와 strict TypeScript |
| `BaseLayout.astro`, `ArticleLayout.astro`, `PostList.astro`, `NavigationPanel.tsx` | 콘텐츠 중심 레이아웃·밀도 높은 목록·반응형·시리즈 이동 |
| `src/pages/` | 홈·아카이브·카테고리·시리즈·태그·글·RSS·robots·404 |
| `src/components/SiteControls.tsx`, `Expandable.tsx`, `ui/` | shadcn 검색·메뉴·테마·사진 확대·접기 |
| `src/scripts/ui.ts` | 스크롤에 따른 TOC 표시 |
| `Photo.astro`, `scripts/migrate-images.mjs`, `image-manifest.json` | 새 MDX 사진 컴포넌트, R2 다운로드/업로드/공개 검증 도구 |
| `astro.config.mjs`, `.env.example`, `.node-version`, `pnpm-lock.yaml` | 정적 빌드, 실제 origin 검증, 이미지 전환 검증, 버전 재현 |
| `scripts/verify-*.mjs` | 원본·HTML·검색에 대한 재실행 가능한 감사 |
| `README.md`, `migration/deployment.md` | 실행·수정·글쓰기·GitHub·Pages·R2·도메인·SEO 안내 |

Astro 7.3.1, MDX 8.0.0, Tailwind 4.3.3, Pagefind 1.5.2를 사용했다. Node 24.12.0 / pnpm 10.28.0에서 실행했다. 2026-09-12 디자인 변경 요청에 따라 React 19.3.0과 공식 shadcn/ui 컴포넌트를 도입했다. 정적 요소는 서버에서 렌더링하며 상호작용만 React island로 처리한다. DB·로그인·검색 backend·이미지 API 서버는 요구하지 않는 구조다.

## 검증 결과

- `pnpm check`: 오류 0, 경고 0, 힌트 0.
- `pnpm verify:migration`: 125개 성공, 실패 0. 시리즈 23개 대조.
- `pnpm build`: 정적 HTML 325개와 한국어 Pagefind index 125개 생성.
- `pnpm verify:build`: 실패 0. 원본 링크에서 기인한 경고 1개는 별도 보존.
- `pnpm verify:search`: 전체 125개 문서의 제목·설명·날짜·카테고리·시리즈·태그 대조. 해피해킹 1개, 이벤트 루프 5개, useEffect 5개, Express 10개 결과에서 예상 글을 찾음. 존재하지 않는 정확한 문장 검색도 통과.
- 실제 MDX 페이지에서 Photo의 src/alt, 크기, srcset, caption, 촬영 정보, lazy 속성, lightbox 표식이 HTML로 렌더링되는지 확인. 테스트용 페이지는 최종 사이트에서 제외.
- 이미지 도구: 설정 없는 업로드·도메인 없는 검증·검증되지 않은 이미지 도메인의 사이트 빌드가 각각 중단되는지 확인. 실제 이미지 요청·업로드는 하지 않음.
- 로컬 HTTP: 홈·아카이브·C/C++ 시리즈·Pagefind JS/worker/index·RSS·robots의 200, 없는 주소의 404, RSS 125개 item 확인.

Markdown 처리 함수 변경이 기존 Content Collections 캐시에 가려지는 사례를 발견하여 `dev` 시작과 `build`에 공식 `--force` 옵션을 적용했다. R2 매핑 변경 시에도 콘텐츠를 다시 렌더링한다.

검색 검증은 생성된 JS/WASM을 Node에서 실행했고, HTTP 자산 응답도 확인했다. 이 자동 스크립트는 브라우저 조작을 포함하지 않는다. 2026-09-12에 별도로 실제 브라우저에서 검색 결과·화살표/Enter 이동·다크 모드·이미지 확대·모바일 390px 메뉴와 목차·연도 접기 및 바로가기 복원을 확인했다. 모든 화면 크기를 전수 검사한 것은 아니다. 사진의 실제 내용이나 모든 외부 링크의 HTTP 가용성도 검증 범위에 포함되지 않는다.

## 수동 확인 및 남은 외부 설정

**수동 확인 표시가 있는 108개 글은 변환 실패 108개라는 뜻이 아니다.** `manual-review.md`에 개별 글과 사유를 적었다. 주요 항목은 HTML 포함 26개 글, 본문 이미지의 빈 alt 223개 참조, 언어 미지정 코드 블록 93개다.

- **학교생활:** Velog 목록 4개, 공개 상세 3개. 원래 index 1, 2, 4를 보존했다. 나머지 항목의 비공개/삭제 여부와 제목은 확인할 수 없다. I cannot verify this with the available tools.
- **C언어 Express 9장 #05:** 원본에 시리즈가 없어 카테고리만 배정했다. 시리즈 순서를 지어내지 않았다.
- **[DEVOCEAN YOUNG] 뜨거웠던 발대식 후기:** h3를 h2로 닫은 HTML과 표가 있다. 파서 보정 결과를 편집자가 확인하는 것이 좋다.
- **코드잇과 함께 성장하는 여정:** 원문에 scheme 없는 `codeit.kr` 링크가 있다. 새 사이트에서 잘못된 상대 경로가 되는 원본 링크 1개이며 의도한 목적지를 확인한 후 고쳐야 한다.
- 원본 HTML의 inline style/border는 안전한 렌더링 과정에서 허용하지 않았고, 원본 파일에는 그대로 남겼다. 사진의 alt·caption 내용을 추측해서 추가하지 않았다.

현재 이미지는 원래 Velog/CDN URL을 사용한다. 고유 URL 271개의 다운로드·R2 업로드·공개 domain 검증 후 `MEDIA_BASE_URL`을 켜면 본문·썸네일·Open Graph가 새 주소를 사용한다. 현재는 이미지의 완전한 플랫폼 독립까지 완료된 상태가 아니다.

실제 GitHub 저장소 생성·push, Pages 배포, DNS/도메인 연결은 하지 않았다. 자격증명과 도메인을 꾸며 넣지 않고 연결 방법을 문서화했다. Velog에서 도메인 간 redirect/canonical을 설정할 수 있다고 가정하지 않았다. SEO 전략은 `deployment.md`에 공식 근거와 함께 정리했다.

## 로컬 실행과 다음 단계

코드 수정: `pnpm dev`. 검색을 포함한 결과 확인: `pnpm build` 후 `pnpm preview`.

현재 미리보기는 `http://127.0.0.1:4321/`에서 실행 중이다. 로컬 서버가 종료되면 위 명령으로 다시 실행한다. 기본 상태는 noindex이며 실제 도메인이 없어서 sitemap/canonical을 공개용 값으로 생성하지 않는다.

다음으로 실제 GitHub 저장소와 Pages를 연결하고, R2 이미지 이전을 검증한 후 개인 도메인의 `SITE_URL`과 `ALLOW_INDEXING=true`를 설정한다. 구체적인 명령·환경변수·되돌리기 방법은 실행 안내와 배포 안내에 있다.
