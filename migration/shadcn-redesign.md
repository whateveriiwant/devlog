# shadcn/ui 디자인 전환

2026-09-12 사용자 요청에 따라 기존 블로그 UI를 공식 shadcn/ui 컴포넌트와 Neutral 테마로 전환했습니다. Astro 정적 콘텐츠 구조를 유지하며 React integration을 추가했습니다.

| 화면 요소 | 적용한 구성 |
|---|---|
| 헤더·탐색 링크·테마 전환 | Button, buttonVariants, Lucide |
| 검색 | Dialog + Command + Kbd + Badge, 기존 Pagefind index |
| 데스크톱 탐색 | Sidebar 및 SidebarMenu |
| 모바일 탐색 | Sheet 안에 Sidebar |
| 글·시리즈·주제 목록 | Item, ItemContent, ItemActions |
| 태그·개수 표시 | Badge 및 badgeVariants |
| 글 위치 | Breadcrumb |
| 아카이브 연도·목차 | Collapsible + Button |
| 이미지 확대 | Dialog |
| 색상·테두리·둥글기·본문 typography | shadcn Neutral light/dark CSS 토큰 |

공식 CLI 4.21.0으로 new-york 컴포넌트 소스를 추가했습니다. React 19.3.0 / Astro React 6.0.5를 사용합니다. 컴포넌트 소스는 `src/components/ui/`, 설정은 `components.json`에 있습니다. 정적 Sidebar·목록·Badge·Breadcrumb는 HTML로 렌더링하고, 검색·메뉴·이미지 확대·테마·접기만 브라우저에서 React로 동작합니다. Markdown 본문의 표·코드·인용은 원문 HTML 구조를 유지하고 같은 테마 토큰으로 스타일링했습니다.

공식 자료: [Astro 설치](https://ui.shadcn.com/docs/installation/astro), [테마](https://ui.shadcn.com/docs/theming).

## 검증

- `pnpm check`: 오류 0, 경고 0, 힌트 0.
- `pnpm build`: 325개 HTML 페이지, Pagefind 125개 글 색인.
- `pnpm verify:migration`: 125개 글 원문과 metadata 보존 검증 통과.
- `pnpm verify:build`: 글 본문·이미지·코드·목차 anchor·23개 시리즈 순서·아카이브 125개 글 검증 통과.
- `pnpm verify:search`: 전체 검색 문서와 metadata, 한국어/영어 검색 검증 통과.
- 실제 브라우저: 검색 버튼, ⌘K, React 검색 20개 결과, 아래 화살표/Enter로 글 열기, 다크 모드, 이미지 확대 및 Escape 닫기/원래 이미지 버튼으로 포커스 복원 확인.
- 모바일 viewport 390×844: Sheet 열기와 아카이브 이동, 목차 접기/펼치기, 연도 접기와 바로가기 복원, 시리즈 목록 확인. 시리즈 화면 가로 넘침 없음(스크롤바 제외 viewport/문서 너비 각각 375px).
- 브라우저 검사 시점에 수집된 error/warn 로그 0개. 모든 기기·브라우저를 전수 검사한 것은 아닙니다.

기존 원문의 `codeit.kr` 상대 링크 경고 1개는 그대로입니다. 콘텐츠 재수집, R2 업로드, GitHub push와 외부 배포는 이번 디자인 변경에 포함되지 않습니다.

실행·수정 방법은 `run-guide.md`, 갱신된 전체 소스는 `seungjun-blog-source.zip`에 있습니다.
