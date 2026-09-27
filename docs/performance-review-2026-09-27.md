# 성능 분석 기록 — 2026-09-27

## 범위와 상태

- 분석 대상: `codex/admin-backoffice` 작업 트리. 분석 당시 `origin/main`과 소스 차이가 없었다.
- 공개 페이지, 백오피스, Markdown 편집기, CMS/사이트 Worker, D1 스키마, CI/CD와 이미지 정리 경로를 읽었다.
- 제품 코드는 수정하지 않았다. 운영 응답 시간, 브라우저 CPU 프로파일, D1 실행 계획과 rows_read는 측정하지 않았다.
- 아래 순서는 코드상의 불필요한 작업과 사용자 영향으로 정한 개선 우선순위다. 측정된 지연 시간 순위가 아니다.

## 개선 목록

### P1. 편집 API의 반복 GitHub 인증 조회

근거: `worker/cms.mjs:108–154, 838–844`, `worker/site.mjs:773–785`.

`cms_session` 쿠키는 CMS 호스트에만 설정된다. 편집 API는 사이트 호스트의 `/api/content/editor/...`로 요청하며 사이트 Worker가 전달받은 헤더를 CMS로 전달한다. 이 경로에서는 CMS 호스트 전용 쿠키가 전달되지 않아 `isEditor()`가 Bearer 토큰으로 GitHub `/user`를 다시 호출한다.

- 영향: 목록 조회, 글 열기, 저장, 삭제에 외부 API 왕복이 추가된다.
- 권장: 서버 세션 검증 경로를 통일해 정상 편집 요청의 GitHub 재조회를 없앤다. 서버의 허용 계정 확인과 요청 Origin/CSRF 방어는 유지한다.
- 보안 의존성: 단순히 광범위한 도메인 쿠키를 재사용하는 것으로 끝내지 않는다. 세션 폐기와 쿠키 범위도 함께 설계한다.
- 완료 조건: 로그인 시 계정 확인 후 정상 편집 API가 GitHub `/user`를 반복 호출하지 않고, 비로그인/다른 계정 요청은 거부한다.

### P1. 백오피스의 서버 페이지네이션 부재와 500개 제한

근거: `worker/cms.mjs:317–368`, `src/components/AdminDashboard.tsx:54, 128–154`.

API는 발행 글, 초안, 휴지통을 각각 최대 500개까지 읽고 시리즈까지 반환한다. 화면은 받은 배열을 검색·필터링한 뒤 12개씩 자른다.

- 영향: 초기 전송량 증가. 각 상태가 500개를 넘으면 이후 글이 검색과 목록에서 빠지고 표시 개수도 실제 전체 개수가 아니다.
- 권장: 상태, 검색어, 시리즈와 커서를 서버에 전달하고 한 페이지와 전체 집계만 반환한다. 공개 `/posts`의 커서 방식을 재사용한다.
- 완료 조건: 500개를 넘는 데이터에서도 마지막 글을 조회·검색할 수 있고, 초기 응답이 한 페이지 규모를 유지한다.

### P1. 선택한 글을 열기 전에 전체 목록을 기다림

근거: `src/components/WriteEditor.tsx:300–355`.

편집기는 설정 → 관리 목록 전체 → authorized 설정 → 선택 글 조회 순서로 실행한다.

- 권장: 선택한 글과 시리즈 선택에 필요한 데이터만 우선 조회한다. 관리 목록은 백오피스 화면에 맡긴다.
- 완료 조건: 선택한 글을 여는 데 발행/초안/휴지통 전체 조회가 필요하지 않다.

### P1. 숨겨진 미리보기도 입력마다 전체 변환

근거: `src/components/WriteEditor.tsx:159–173`.

`previewHtml`의 useMemo는 본문이 바뀔 때마다 Markdown 파싱과 DOMPurify 정제를 실행한다. 미리보기 표시 상태는 계산 조건에 없다.

- 권장: 미리보기 표시 중에만 계산하고 짧은 debounce를 적용한다. Worker 분리는 입력 프로파일에서 필요성이 확인될 때 검토한다.
- 완료 조건: 미리보기 OFF에서 본문 입력으로 HTML 변환이 실행되지 않는다. ON에서는 최신 본문이 정상 표시되고 정제는 유지된다.

### P2. 공개 콘텐츠 캐시 부재

근거: `worker/site.mjs:291–299, 411–414, 238–240, 595–598`, `worker/cms.mjs:66–74, 947–955`.

홈은 글·시리즈·태그·통계를 병렬로 요청한다. 공개 HTML과 공개 API 응답은 `no-store`다. 같은 공개 내용을 요청할 때마다 DB 조회와 HTML 구성이 반복된다.

- 권장: 공개 데이터/HTML에 캐시를 적용하고 발행·수정·삭제·복원 시 관련 캐시를 무효화한다. 관리자 응답은 계속 private/no-store로 유지한다.
- 주의: TTL만 늘리면 새 글이나 삭제가 늦게 반영된다. 캐시 무효화가 없는 적용은 하지 않는다.
- 완료 조건: 캐시 적중에서 DB 조회량이 감소하고 콘텐츠 변경 결과가 즉시 반영된다.

### P2. 검색과 태그 관계의 반복 집계

근거: `worker/cms.mjs:1120–1178`, `src/components/TagExplorer.tsx:60–89`, `src/components/SiteControls.tsx:214–252, 337–343`.

- 검색은 최대 6개 검색어에 대해 5개 필드를 `LIKE '%term%'`로 검사한다. 앞의 와일드카드는 일반 B-tree 검색 최적화를 어렵게 한다. LIMIT 50은 결과 수만 제한한다.
- 검색창의 표시 limit을 늘리면 같은 검색이 재실행된다. 이미 받은 50개 안에서 더 표시할 때도 API를 다시 부른다.
- 태그 관계는 각 글의 태그 배열을 두 번 펼쳐 전체 태그 쌍을 집계한다. 태그 k개인 글의 중간 조합 작업은 대략 k²에 비례한다. 화면 노드는 30개지만 서버 집계 범위는 전체다.
- 권장: 검색 결과 재사용, 태그 관계 계산 범위 제한과 캐시를 먼저 적용한다. FTS5는 한글·부분 문자열 검색 품질과 운영 비용을 비교한 뒤 도입한다.
- 완료 조건: 결과 더 보기에서 동일 검색을 반복하지 않는다. 관계 API가 화면에 필요한 범위를 넘는 전체 계산을 매번 수행하지 않는다.

### P2. 새 D1 글과 기존 정적 글의 이미지 처리 차이

근거: `scripts/rehype-content.mjs:57–65`, `worker/cms.mjs:31–55`, `src/components/WriteEditor.tsx:89–119`, `worker/site.mjs:256–265`.

- 기존 정적 Markdown 변환은 이미지에 lazy loading과 async decoding을 넣는다. D1 Markdown 변환은 이를 자동으로 추가하지 않는다.
- 작은 목록 썸네일에도 별도 축소본 없이 업로드 URL을 사용한다.
- 업로드 JPEG/PNG의 최대 변 2400px 축소 및 더 작은 WebP로 변환하는 처리는 이미 있다. 변환 결과가 더 크면 원본을 유지한다.
- 권장: 이미지 렌더링 속성을 통일하고 썸네일용 작은 이미지를 제공한다.
- 한계: 실제 이미지 크기, CDN 캐시 적중, 네트워크 지연은 측정하지 않았다. 과거 이미지 지연의 확정 원인으로 단정하지 않는다.

### P3. 변경 범위와 무관한 전체 빌드·배포

근거: `.github/workflows/ci.yml:48–71`, `package.json:16`, `src/pages/write.astro:6–25`, `src/pages/search-index.json.ts:3–21`.

CMS만 바뀌어도 전체 Astro/Pagefind 빌드 후 두 Worker를 배포한다. D1 모드에서도 글쓰기 HTML에 기존 Git 글 목록을 전달하고 전체 원문이 든 정적 검색 JSON을 만든다.

- 권장: Git 기반 편집과 정적 검색 fallback의 유지 여부를 결정한 뒤 불필요한 산출물을 없앤다. 변경 경로로 빌드·배포를 구분한다.
- 구분: 현재 D1 글 발행은 DB 갱신 경로다. 글 작성마다 이 CI 전체 빌드가 필요한 구조는 아니다.
- 보안 의존성: 정적 검색 fallback은 삭제/수정 콘텐츠 노출 문제도 있으므로 보안 기록과 함께 처리한다.

### P3. 이미지 정리의 이미지별 Wrangler 실행

근거: `scripts/cleanup-unused-images.mjs:43–71, 197–225`, `.github/workflows/cleanup-unused-images.yml:26–37`.

삭제 후보마다 별도 pnpm/Wrangler 프로세스를 실행해 D1 참조를 재확인한다. R2 작업도 순차 수행한다. 워크플로는 전체 Git 이력 checkout과 전체 의존성 설치를 한다.

- 권장: 제한된 크기의 묶음 조회와 제한된 동시성을 검토한다. 삭제 직전 최신 참조 확인, 7일 유예, 실패 시 중단은 유지한다.
- 우선순위: 대화형 편집 지연보다 후순위인 배치 작업이다.

## 유지할 구현

- 공개 글 목록은 커서 페이지네이션과 최신순 인덱스를 이미 사용한다: `worker/cms.mjs:1054–1102`, `migrations/0001_content.sql:18–21`.
- 공개 본문은 발행 시 HTML로 변환해 저장하며 읽을 때 원문을 다시 파싱하지 않는다: `worker/cms.mjs:634, 1007`.
- 프로덕션 getContent는 Promise를 재사용한다: `src/lib/content.ts:85–89`. 페이지마다 전체 콘텐츠를 처음부터 다시 읽는다고 단정하지 않는다.
- revision/중복 요청 방어와 이미지 삭제 안전장치를 성능 개선 명목으로 제거하지 않는다.

## 저장소 비공개 전환 결정 제안

공개 소스 포트폴리오 목적이 없다면 Git 편집 경로와 OAuth 권한을 정리한 뒤 private 전환을 권장한다. 현재 D1 발행·공개 조회와 Cloudflare 배포 구조 자체는 공개 저장소를 요구하지 않는다.

- `public_repo`는 비공개 저장소 편집 권한이 아니다. 레거시 편집을 제거하면 계정 확인에 필요한 권한만 요청하는 방향이 적절하다.
- 공개 저장소의 표준 GitHub 실행기는 무료지만 private은 플랜 할당량을 사용한다. GitHub Free 기준 월 2,000분이며 계정 플랜과 잔여량은 확인하지 않았다.
- 기존 공개 포크는 private 전환으로 숨겨지지 않는다. private 전환이 세션·API 취약점을 해결하는 것은 아니다.
- 이번 작업에서는 저장소 공개 범위를 변경하지 않았다.

## 참고 자료

- [Cloudflare D1 인덱스와 LIKE 검색](https://developers.cloudflare.com/d1/best-practices/use-indexes/)
- [GitHub OAuth 권한](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [GitHub Actions 요금](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [저장소 공개 범위 변경](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)

## 후속 실행 순서

보안 검토 결과 중 노출/인증 문제를 우선 반영한다. 이후 반복 인증, 서버 페이지네이션과 편집 진입, 숨겨진 미리보기, 이미지 처리, 공개 캐시 순으로 진행한다. 구현과 운영 검증은 아직 수행하지 않았다.
