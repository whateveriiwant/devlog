# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

개발자 Seungjun의 개인 개발 블로그(seungjun.sh)를 읽는 사람들. 네 부류가 있다.

- 검색엔진으로 특정 기술 문제를 찾아 들어오는 개발자
- 글을 대신 찾아 인용·요약하는 AI 검색·답변 엔진(GEO 대상)
- 글쓴이 본인. 학습 기록을 다시 찾아본다.
- 채용 담당자와 동료 개발자. 글쓴이의 사고와 이력을 평가한다.

## Product Purpose

Velog(`@jsj9620`)에서 이전한 공개 글 125개와 시리즈 23개를 Markdown 원문으로 보존하고, 새 글을 브라우저에서 바로 작성·발행하는 Astro 정적 블로그. 성공 기준은 검색 유입, 읽기 경험, AI 답변 엔진 노출(GEO) 세 가지를 함께 만족하는 것이다. 어느 하나를 위해 나머지를 희생하지 않는다.

## Positioning

글 원문을 그대로 보존하면서 카테고리, 시리즈, 태그, 연도별 아카이브, 본문 검색(Pagefind)으로 탐색하게 하는 개인 소유 블로그. 작성 화면에서 이미지 업로드와 발행까지 끝낸다.

## Operating Context

- 글: `src/content/posts/`의 Markdown/MDX, 시리즈는 `src/content/series.json`
- 배포: GitHub `whateveriiwant/devlog` `main` → Cloudflare Workers 정적 자산(`seungjun.sh`)
- 이미지: Cloudflare R2(`media.seungjun.sh`), 기존 Velog 이미지는 원래 URL 유지
- 작성: 로그인한 GitHub 세션이 있어야 접근하는 자체 편집기(`/write`)
- 검증: `pnpm check`, `pnpm build`, `pnpm verify:*`

## Capabilities and Constraints

- Astro 7, React 19 island, Tailwind 4, radix-ui 기반 컴포넌트
- 정적 빌드. 검색은 빌드 결과를 색인하는 Pagefind
- 구조화된 글 메타데이터(제목·날짜·태그·시리즈)와 canonical, sitemap, RSS가 SEO·GEO의 기반이다.
- 현재 확인된 검색 진단 이슈는 `docs/search-console-diagnosis-2026-10-12.md` 참조.

## Brand Commitments

- 본문과 UI 문구는 한국어 우선이다. 한글 타이포그래피 품질이 중요하다.
- 라이트·다크 두 테마를 모두 유지한다.
- 접근성은 WCAG AA를 기준으로 한다.
- 애널리틱스는 `docs/analytics-privacy-*.md`의 프라이버시 원칙을 따르고 추적을 최소화한다.

## Evidence on Hand

- 실제 글 125개, 시리즈 23개(`src/content/`)
- Search Console 진단 문서와 애널리틱스 계획 문서(`docs/`)
- 후기, 방문자 수, 수상 등 외부 증거는 없다. 지어내지 않는다.

## Product Principles

1. 글이 주인공이다. 읽기 경험이 장식보다 먼저다.
2. 사람과 기계가 같은 구조를 읽는다. 시맨틱 HTML, 메타데이터, 명확한 제목 계층이 SEO·GEO를 겸한다.
3. 원문 보존이 우선이다. 이전한 글은 내용을 바꾸지 않는다.
4. 발행 마찰을 줄인다. 작성에서 공개까지 한 화면에서 끝나야 한다.
5. 프라이버시를 지킨다. 측정은 필요한 만큼만 한다.

## Accessibility & Inclusion

WCAG AA 기준. 키보드 조작, 대비, 스크린리더 동작을 유지한다.
