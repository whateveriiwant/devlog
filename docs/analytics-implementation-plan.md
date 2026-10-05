# devlog GA4 프로덕션 모니터링 전환 계획

- 갱신일: 2026-10-03
- 현재 상태: 기존 분석 변경을 `codex/ga4-completion` 작업 트리에 이어받아 실제 D1 글 렌더링 경로의 분석 누락과 robots 강제 인덱싱을 수정했다. 운영 GA 계정 `410455528` / 속성 `557066996`에서 운영 스트림 `15942609257` / `G-RQ6456HXLD` 연결을 읽기 확인했다. 코드·빌드·Workers 검증은 아래 13절에 기록한다. 사용자는 동의 전 태그 차단·동의한 방문자만 수집하는 basic 방식을 선택했다. 동의/거부/철회 UI와 저장 게이트를 구현했으며 운영 개인정보 안내 전체는 아직 확정하지 않았다. GA 설정 변경·운영 활성화·production 배포는 수행하지 않았다. stage 사이트는 무수집 구성으로 배포하고 noindex와 smoke 검증을 통과했다.
- 목표: 승인된 프로덕션 측정 ID를 프로덕션 사이트에만 연결하고, 글별 조회수·참여 시간·본문 도달·글 이동을 GA4에서 검증·모니터링한다.
- 진행 제한: 최신 작업은 `/Users/seungjun/.codex/worktrees/ga4-completion/devlog`의 `codex/ga4-completion`에서 수행한다. GA 속성 변경·운영 ID 활성화·production 배포·다음 체크리스트 항목은 사용자의 별도 지시 전까지 수행하지 않는다.
- 기록 해석: 1–12절의 2026-10-02 결과는 당시 기록이다. 현재 상태와 상충하면 13절의 2026-10-03 직접 확인 결과를 우선한다. stage 글의 index,follow 응답은 이번 stage 배포 후 noindex,nofollow로 수정됐으며 아래 배포 후 증거로 구분한다.

## 1. 범위와 현재 코드 근거

첫 구현은 Google tag(`gtag.js`)를 직접 연결한다. GA4 화면을 통계 화면으로 사용한다. 별도 SDK, Google Tag Manager, 자체 통계 DB, 관리 화면 대시보드, 화면 녹화는 추가하지 않는다.

이번 계획에서 직접 확인한 로컬 코드 기준:

| 파일                                                                    | 확인한 구조                                                | 구현에 사용할 부분                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `astro.config.mjs`                                                      | `output: 'static'`, `SITE_URL`로 사이트 주소 설정          | 빌드 시 분석 설정 적용                         |
| `src/pages/blog/[slug].astro`                                           | 정적 글 경로 생성, `ArticleLayout` 사용                    | 공개 글 측정 경로                              |
| `src/layouts/BaseLayout.astro`                                          | 공개 페이지 공통 HTML, `postId` 전달받음                   | GA 초기화와 공개 페이지 범위 제한              |
| `src/layouts/ArticleLayout.astro`                                       | `.prose`에 본문, `.article-pagination`에 이전/다음 링크    | 본문 진행률과 글 이동 측정                     |
| `src/scripts/ui.ts`                                                     | 기존 목차 강조 처리                                        | 기존 동작 유지, 분석 코드는 별도 파일로 분리   |
| `src/pages/write.astro`, `src/pages/login.astro`, `public/admin/*.html` | 공개 공통 레이아웃과 분리된 화면                           | 분석 대상에서 제외                             |
| `worker/site.mjs`                                                       | 공개 글은 D1 응답과 article-template을 HTMLRewriter로 합성 | 런타임 글의 분석 설정·본문·이동 표식 연결 필요 |
| `.github/workflows/ci.yml`                                              | `pnpm check`, `pnpm build`, 조건부 사이트 배포             | 빌드 단계에 GA 환경 변수 전달                  |

이 내용은 현재 체크아웃 기준이다. 실제 작업 시작 시 기본 체크아웃은 `codex/github-actions-deploy`였고 `origin/main`보다 26개 커밋 뒤였으며 upstream 브랜치가 없었다. 그 체크아웃의 변경 파일은 보존하고, `origin/main`과 같은 `e55afb3`의 별도 `codex/ga4-analytics` 작업 트리에서 분석 변경을 진행했다. 현재 코드 경로는 Astro 정적 글 생성과 `ArticleLayout`이다. 이 최초 판단은 잘못되었다. 2026-10-03에 main의 Worker·설정과 실제 공개 글 응답을 확인했으며, D1 런타임 템플릿이 현재 측정 경로다.

`ArticleLayout.astro`에는 기존 태그 표시 수정이 있다. 이를 포함한 작업 중 변경을 보존하고, 분석과 관련 없는 편집기·콘텐츠 변경을 이번 작업에 섞지 않는다.

## 2. 측정 항목과 해석 기준

| 항목              | 수집 방식                              | GA에서 확인할 내용           |
| ----------------- | -------------------------------------- | ---------------------------- |
| 조회수            | 기본 `page_view`                       | 페이지 경로별 Views          |
| 방문 사용자       | GA 기본 사용자 지표                    | 페이지 경로별 사용자 수      |
| 참여 시간         | 기본 `user_engagement` 등 GA 자동 측정 | 페이지 경로별 평균 참여 시간 |
| 마지막으로 본 글  | GA 기본 Exits                          | 탐색에서 페이지 경로별 Exits |
| 본문 도달 구간    | 맞춤 `article_progress`                | 25%·50%·75%·90% 도달 사용자  |
| 이전/다음 글 이동 | 맞춤 `article_navigation`              | 이동 방향과 목적지 경로      |

평균 참여 시간은 페이지에 포커스가 있었던 시간이다. 실제 독서 시간으로 표시하지 않는다. 스크롤은 화면에 해당 구간이 도달했다는 뜻이며, 내용을 읽었거나 이해했다는 증거가 아니다.

글별 종료 횟수와 본문 진행률을 함께 보되, 마지막 스크롤 이벤트를 정확한 이탈 위치로 표현하지 않는다. 빠른 스크롤·목차 점프·짧은 글·이벤트 누락이 있기 때문이다. 별도의 `exit` 이벤트나 탭 종료 감지 로직은 만들지 않는다.

근거: [GA 페이지별 지표](https://support.google.com/analytics/answer/12926732?hl=en), [참여 시간](https://support.google.com/analytics/answer/11109416?hl=en-SG), [Exits](https://support.google.com/analytics/answer/11080047?hl=en-AT).

## 3. GA4 설정과 구현 전 준비

1. 사용자가 제공한 운영 스트림 정보는 `devlog-product` / `https://seungjun.sh` / 스트림 ID `15942609257` / 측정 ID `G-RQ6456HXLD`다. GA 계정에서 실제 속성 연결과 설정은 운영 활성화 전 읽기 확인이 필요하다.
2. 검증 데이터가 운영 통계에 들어가지 않도록 별도 검증용 속성과 측정 ID를 준비한다. 일반 로컬 개발과 PR 미리보기는 기본적으로 분석을 끈다.
3. 운영 데이터 스트림의 향상된 측정에서 페이지 로드 측정은 사용하고, 브라우저 히스토리 변경에 따른 페이지 조회 측정은 끈다. 현재 정적 페이지 이동과 목차 이동을 구분하고 중복 조회를 피하기 위한 선택이다.
4. 기본 `scroll` 측정은 끈다. 이는 전체 페이지 90% 도달만 측정하므로, 이번 본문 기준 `article_progress`와 혼동하지 않도록 한다. 필요한 나머지 향상된 측정 항목은 개별 설정한다.
5. 이벤트 범위 맞춤 측정기준을 등록한다: `progress_percent`, `navigation_direction`, `target_path`. 현재 글은 기본 페이지 경로로 구분하므로 첫 구현에 `post_id` 측정기준을 추가하지 않는다.
6. 운영 개인정보 안내와 방문자 동의 처리 방식을 확인하고 필요한 설정을 정한다. 동의가 필요한 운영 정책이라면 초기화보다 앞에 그 처리를 연결한다. 이 계획은 배너 필요 여부에 관한 법적 판단을 포함하지 않는다. 광고 개인화나 Google Signals는 이번 목적에 포함하지 않는다.

검증 스트림은 `devlog-test`, 스트림 ID `15941128089`, 측정 ID `G-8SFTFGKZ9Y`다. 사용자가 제공한 운영 스트림은 `devlog-product`, URL `https://seungjun.sh`, 스트림 ID `15942609257`, 측정 ID `G-RQ6456HXLD`다. 이 운영 스트림의 GA 속성 연결·현재 설정·기존 사이트 수집 상태와 계정 접근 권한은 확인되지 않았다. 운영 활성화는 별도 명시 지시 전까지 보류한다.

근거: [향상된 측정과 기본 scroll](https://support.google.com/analytics/answer/9216061?hl=en), [페이지 조회 중복 방지](https://developers.google.com/analytics/devguides/collection/ga4/views), [맞춤 측정기준 등록](https://support.google.com/analytics/answer/14239696?hl=en), [동의 상태 연결](https://developers.google.com/tag-platform/security/guides/consent).

## 4. 공통 초기화와 수집 범위

현재 구현은 `GA4_DEPLOY_TARGET`, `PUBLIC_GA_MEASUREMENT_ID`, `GA4_PRODUCTION_ENABLED`, `GA4_PRODUCTION_MEASUREMENT_ID`, `SITE_URL`, `ALLOW_INDEXING`을 사용한다. 환경 이름·ID·origin이 허용 조합과 모두 일치하고 공개 indexable 글일 때만 동작한다.

| 환경                   | 측정 ID                                          | 허용 origin                                                | 동작                                                                          |
| ---------------------- | ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 일반 로컬 개발·PR 빌드 | 미설정                                           | 관계없음                                                   | Google 스크립트와 수집 요청 없음                                              |
| stage                  | `G-8SFTFGKZ9Y`만                                 | `https://devlog-site-stage.seungjun-jeong10.workers.dev`만 | indexable 공개 글에서 `#ga_debug`일 때만 전송하고 debug_mode 사용             |
| production             | `G-RQ6456HXLD` (저장소 변수에 준비, 활성화 아님) | `https://seungjun.sh`만                                    | 별도 승인 뒤 main 운영 빌드에서 flag와 두 ID가 일치하고 indexable인 공개 글만 |

`BaseLayout`에서 ID, 사이트 주소, 페이지 종류를 분석 스크립트에 전달한다. 클라이언트는 실제 `location.origin`과 설정 주소가 일치하는지 확인한 뒤 외부 `gtag.js`를 로드한다. 개발 모드와 관리·로그인·404·미리보기 페이지에서는 초기화하지 않는다. origin 확인 전에 Google 스크립트를 미리 로드하지 않는다.

`codex/ga4-analytics`에서는 stage 측정 ID와 origin이 정확히 일치하고 indexable 공개 글일 때만 HTML에 stage 표식을 넣는다. 브라우저도 origin·경로·query·fragment 조건을 다시 확인한 뒤 Google 스크립트를 요청한다. 일반 빌드에는 ID가 없고 production은 별도 활성화 flag와 ID 일치가 필요하다.

앞선 stage 검증 시점에는 `page_view`만 확인했고 현재 작업에서 `article_progress`·`article_navigation` 이벤트를 추가했다. production 빌드에는 전체 방문자용 `debug_mode`를 넣지 않는다. 앞선 stage 수신 결과로 프로덕션 통계나 현재 코드의 실제 글 이벤트 수신을 확인했다고 판단하지 않는다.

초기화 순서:

1. 설정과 공개 페이지 조건 확인. ID가 없으면 즉시 종료하고, 잘못된 ID 형식은 설정 오류로 처리한다.
2. 필요한 운영 동의 정책 적용.
3. `dataLayer`와 `gtag` 큐를 먼저 준비한다.
4. `gtag('config', ...)`를 한 번 실행해 기본 `page_view`를 수집한다. 별도의 수동 `page_view`를 함께 보내지 않는다.
5. 외부 스크립트는 비동기로 로드하고 본문 측정 리스너를 연결한다.

현재 글의 `page_location`은 origin + pathname으로 보내 쿼리 문자열과 해시를 제외한다. 이번 구현은 UTM 캠페인별 분석을 지원 범위에 넣지 않는다. `page_referrer` 역시 필요한 origin/path 범위로 정리하고, 폼 값·검색 입력·초안 본문·인증 토큰·GitHub 사용자 정보는 맞춤 이벤트에 넣지 않는다. 설정과 Network 검증에서 자동 수집 항목도 확인한다.

Google 스크립트가 차단되거나 실패해도 글 읽기와 링크 이동은 계속 동작해야 한다. 별도 재시도나 서버 측 우회 수집을 만들지 않는다. 실제 배포의 공개 페이지 CSP를 확인하고 필요하면 허용 도메인만 제한적으로 추가한다. 관리·로그인 경로의 기존 보안 정책은 분석 도입을 위해 완화하지 않는다.

근거: [gtag 이벤트 초기화](https://developers.google.com/analytics/devguides/collection/ga4/events), [페이지 주소와 기본 page_view](https://developers.google.com/analytics/devguides/collection/ga4/views).

## 5. 본문 진행률

`ArticleLayout`의 `.prose`에 `data-analytics-body`를 추가한다. 표시용 CSS 클래스와 측정용 선택자를 분리하고, 제목·목차·사이드바·글 하단 이동 영역은 진행률 높이에 포함하지 않는다.

맞춤 이벤트 계약:

| 이벤트             | 매개변수           | 값             | 발생 조건                                 |
| ------------------ | ------------------ | -------------- | ----------------------------------------- |
| `article_progress` | `progress_percent` | 25, 50, 75, 90 | 해당 구간 도달 시 문서 생명주기마다 한 번 |

진행률은 문서 좌표의 본문 상단·본문 높이·화면 하단으로 계산한다.

```text
도달률 = clamp((화면 하단 - 본문 상단) / 본문 높이 × 100, 0, 100)
```

구현 규칙:

- 각 구간의 발송 여부는 작은 `Set`으로 관리한다. 서버 저장이나 주기적 heartbeat는 없다.
- 초기 표시, 스크롤, 창 크기 변경, 본문 이미지 로드 후 다시 계산한다. 화면에 표시 중일 때만 도달 이벤트를 기록한다.
- passive 스크롤 리스너와 `requestAnimationFrame`으로 같은 프레임의 중복 계산을 줄인다.
- 20%에서 80%로 점프하면 아직 보내지 않은 25%·50%·75%를 기록한다. 이는 중간 문단을 읽었다는 의미가 아니다.
- 위로 이동한 뒤 다시 내려도 같은 구간을 중복 발송하지 않는다.
- 본문 높이가 0이거나 본문이 없으면 이벤트를 보내지 않는다. 짧은 글이 처음부터 화면 안에 있으면 초기 표시에서 여러 구간이 기록될 수 있다.
- BFCache로 돌아온 문서는 기존 발송 상태와 리스너를 보존하고 표시 위치를 재평가한다. 새 문서 로드와 새로고침은 새 측정으로 취급한다. 페이지 복원 시 리스너를 중복 등록하지 않는다.
- 나중에 클라이언트 라우팅이 도입되면 페이지별 초기화·정리와 page_view 정책을 함께 수정한다. 현재는 이를 위한 라우터 계층을 만들지 않는다.

## 6. 이전/다음 글 클릭

`ArticleLayout`의 두 링크에 `data-analytics-navigation="previous"` 또는 `"next"`를 추가한다. 링크의 실제 목적지 pathname을 이벤트에 사용한다.

| 이벤트               | 매개변수               | 값                              |
| -------------------- | ---------------------- | ------------------------------- |
| `article_navigation` | `navigation_direction` | `previous` 또는 `next`          |
| `article_navigation` | `target_path`          | 같은 사이트의 `/blog/.../` 경로 |

이벤트 위임으로 기본 클릭과 키보드 링크 활성화를 측정한다. 새 탭에서 여는 보조 클릭도 필요한 경우 `auxclick`으로 처리하되 같은 동작을 두 번 보내지 않는다. `preventDefault`나 분석 전송 완료 대기로 링크 이동을 늦추지 않는다. 전송 누락 가능성은 Network와 DebugView 검증에서 기록한다.

이전/다음 글이 없는 경우 이벤트를 만들지 않는다. 첫 범위는 두 링크이며, 시리즈 페이지네이션·목차 클릭·검색 행동 측정은 별도 요구가 생길 때 추가한다.

근거: [맞춤 이벤트 전송](https://developers.google.com/analytics/devguides/collection/ga4/events).

## 7. 파일별 작업 순서

| 순서 | 파일                                  | 작업                                                        |
| ---- | ------------------------------------- | ----------------------------------------------------------- |
| 1    | `src/layouts/BaseLayout.astro`        | 설정 전달과 분석 대상 공개 페이지 표식 추가                 |
| 2    | `src/scripts/analytics.ts` — 신규     | 초기화·origin 제한·본문 진행률·링크 클릭 처리               |
| 3    | `src/layouts/ArticleLayout.astro`     | 본문과 이전/다음 링크에 측정 표식 추가                      |
| 4    | `scripts/verify-analytics.mjs` — 신규 | Node assert 기반 모의 검증과 빌드 결과의 제외 경로 확인     |
| 5    | `.github/workflows/ci.yml`            | 운영 ID를 main 빌드에만 조건부 전달하고 분석 검증 명령 추가 |
| 6    | 이 문서                               | 실제 적용 설정·검증 결과·남은 제한 기록                     |

새 패키지를 설치하지 않는다. 모의 검증에서 TypeScript 변환이 필요하면 이미 설치된 `typescript`와 Node 기본 모듈을 사용한다. 전송 함수·측정 함수는 이 파일 안에서 필요한 정도로만 분리한다. `src/env.d.ts`는 기존 선언 방식 확인 후 타입 보완이 필요한 경우에만 수정한다.

측정 ID는 브라우저에 전달되는 설정값으로 취급하고 GitHub Actions의 변수로 관리할 수 있다. OAuth 비밀키나 GA API 서비스 계정은 필요하지 않다. Astro 환경 변수는 빌드 때 적용되므로 Cloudflare 런타임 변수만 변경해서 정적 HTML의 GA 설정이 바뀐다고 가정하지 않는다. 실제 빌드 주체가 Actions인지 Cloudflare Builds인지 확인하고 해당 빌드 환경에 적용한다.

처음 확인한 기본 브랜치의 `.github/workflows/ci.yml` build 단계에는 분석 환경 변수가 없었다. `codex/ga4-analytics` 작업 트리의 변경은 PR/default에는 빈 값, main push에만 production URL·target과 승인된 운영 ID를 전달하도록 준비했다. 2026-10-02에 저장소 변수 `GA4_PRODUCTION_MEASUREMENT_ID=G-RQ6456HXLD`를 설정했다. 현재 `GA4_PRODUCTION_ENABLED`와 `ALLOW_INDEXING`은 저장소 변수에 없으므로 해당 작업 트리의 CI 조건에서 운영 ID는 빌드에 주입되지 않고 사이트는 noindex로 유지된다. 기본 브랜치 CI에는 아직 분석 env wiring이 없고 feature 변경도 커밋/PR되지 않아 이 변수를 사용하는 Actions run은 없다.

근거: [Astro 환경 변수와 빌드 시 적용](https://docs.astro.build/en/guides/environment-variables/).

## 8. GA 보고서 구성

1. **글별 기본 보고서:** `/blog/` 상세 경로만 대상으로 조회수·사용자·평균 참여 시간을 본다. 목록 페이지 `/blog/`는 제외한다.
2. **종료 페이지 탐색:** 같은 글 상세 필터로 Exits와 페이지 간 이동을 확인한다.
3. **본문 도달 구간 탐색:** `article_progress`를 대상으로 페이지 경로·`progress_percent`별 사용자 수를 본다.
4. **글 이동 탐색:** `article_navigation`의 방향·목적지별 사용자 수와 이벤트 수를 본다.

도달 비율을 계산한다면 같은 기간·글·사용자 지표·필터로 맞춘다. 예를 들어 해당 글의 75% 도달 사용자 수를 해당 글의 `page_view` 사용자 수로 나눈다. 사용자 수와 조회수(반복 조회 포함)를 섞지 않는다. 같은 사용자의 여러 방문이 합쳐지는 사용자 기준 지표임을 표시한다. 세션별 흐름이 필요할 때는 별도의 퍼널 정의를 정한다.

스코프·동의 상태·태그 차단 등으로 모수가 달라질 수 있으므로 도달 비율을 정확한 독서 완료율로 이름 붙이지 않는다. 특히 90% 도달은 본문 끝에 가까이 내려간 지표이다.

맞춤 측정기준을 보고서에서 사용할 수 있기까지 Google 안내상 24~48시간이 걸릴 수 있다. 실시간 수신 검증과 보고서 반영 확인을 별개 완료 조건으로 둔다. [Google 맞춤 측정기준 안내](https://support.google.com/analytics/answer/14239696?hl=en)

## 9. 검증과 완료 기준

### 코드·빌드 검증

```sh
pnpm check
pnpm build
node scripts/verify-analytics.mjs
```

아래는 이번 구현 작업에서 실행한 명령이다. `scripts/verify-analytics.mjs`는 실제 분석 구현을 Node VM 모의 브라우저에서 실행하며 Google 수집은 발생시키지 않는다. 실제 stage 페이지의 Network·DebugView 회귀 확인은 별도로 기록했다.

- [x] ID 미설정 또는 origin 불일치 시 Google 스크립트 로드와 이벤트 큐 등록이 없다.
- [x] 공개 페이지마다 GA 초기화가 한 번이며, 자동·수동 page_view가 중복되지 않는다.
- [x] `/write/`, `/login/`, `/admin/`, 404·미리보기·noindex에는 분석 초기화 표식과 Google 태그가 없다.
- [x] 본문 없음·높이 0·짧은 글·임계값·점프·반복 스크롤·resize·이미지 로드·BFCache 복원의 모의 검증이 통과한다.
- [x] 이전/다음 링크 이벤트에 방향과 목적지 경로가 맞고 기본 링크 동작이 유지된다.
- [x] 기존 체크아웃의 편집기·콘텐츠 변경을 별도 보존하고 분석 코드만 별도 작업 트리에서 수정했다.

### 검증용 속성에서 브라우저 확인

- [x] 검증용 ID와 검증 origin만 설정한 로컬 빌드로 확인했다. 일반 개발·PR에는 운영 ID를 전달하지 않는다. 현재 live stage는 noindex라 새 코드가 요청을 보내지 않는 별도 회귀 결과를 기록했다.
- [ ] 긴 글·짧은 글·이미지가 있는 글에서 페이지 조회와 진행률을 Network와 DebugView로 확인한다.
- [ ] 초기 페이지 로드 한 번에 page_view 한 건, 목차 이동으로 추가 page_view가 생기지 않는 것을 확인한다.
- [ ] 일반 클릭·키보드·새 탭 이동과 뒤로 가기 복원에서 중복 리스너나 중복 이벤트가 없는지 확인한다.
- [ ] 관리·로그인·404 경로에서는 Google 요청이 없고, 분석 스크립트 차단 시에도 페이지와 링크가 동작한다.
- [ ] 쿼리 문자열·토큰·입력값이 분석 요청에 섞이지 않는지 확인한다.

브라우저 확인은 실제 스크립트 로딩·네트워크·전송을 검증하는 데 사용한다. 테스트용 콘텐츠가 필요하면 격리된 검증 환경의 합성 글을 사용한다. 운영 글·초안·이미지를 수정하거나 삭제하지 않는다. [Google DebugView 안내](https://support.google.com/analytics/answer/7201382?hl=en)

#### 2026-10-02 브라우저 수신 검증 기록

- 최초 브라우저 확인: **수신 실패**. 기존 stage 버전에는 Google 태그가 없어 Network에 `gtag.js`/`collect` 요청이 없었고 DebugView도 비어 있었다.
- 검증 스트림: `devlog-test`, 스트림 ID `15941128089`, 측정 ID `G-8SFTFGKZ9Y`.
- 검증 origin 및 페이지: `https://devlog-site-stage.seungjun-jeong10.workers.dev/#ga_debug`.
- 원인과 조치: 공통 레이아웃에 태그 초기화가 없었다. 검증 ID와 stage origin이 빌드 설정에서 모두 일치하고 브라우저 주소 해시가 `#ga_debug`인 경우만 태그를 포함·실행하도록 했다. `noindex` 페이지는 제외한다.
- 배포 기준: 격리된 임시 worktree에서 `origin/main` `e55afb3d31821b0efb7ebf57b391cd3ef78fcb71`을 기준으로 분석 변경만 적용했다. 현재 체크아웃의 다른 미커밋·미추적 파일은 배포에 포함하지 않았다.
- 로컬 확인: 최신 기준 코드에서 `pnpm check`는 오류 0개, 힌트 6개로 완료했다. 검증 ID·stage origin 빌드는 326페이지 생성 완료. 홈 HTML에는 게이트가 포함되고 `/404.html`, `/write/index.html`, `/login/index.html`, `/admin/index.html`에는 검증 ID가 없었다. 기본 측정 설정 빌드는 별도로 324개 HTML을 확인했고 검증 ID 포함 파일은 0개였다.
- stage 배포: `wrangler.jsonc --env stage`로 사이트 Worker만 배포했다. 새 버전 `c6719cf1-5b90-47a9-9500-304c210578e5`가 100% 트래픽을 받으며 CMS 바인딩은 `devlog-cms-stage`다. stage CMS는 기존 버전 `5be07cf7-bf18-4792-88c1-adcd49a44ab9`를 유지했다.
- Chrome Network: stage 홈 문서 `200 OK`; 전체 28개 요청. `https://www.google-analytics.com/g/collect` 요청은 `204 No Content`였고 `tid=G-8SFTFGKZ9Y`, `en=page_view`, `ep.debug_mode=true`가 확인됐다. Initiator는 해당 측정 ID의 `gtag.js`였다.
- GA4 DebugView: `devlog-test` 선택 상태에서 최근 30분 `page_view` 3건, `first_visit` 1건, `session_start` 1건, `user_engagement` 1건을 확인했다. 최신 `page_view`의 `debug_mode=1`, `page_location=https://devlog-site-stage.seungjun-jeong10.workers.dev/`였다. 조회 시점의 활성 디버그 기기 수는 0이었지만 이벤트 타임라인과 매개변수는 표시됐다.
- 운영 측정 ID와 운영 Worker/CMS 배포: 수행하지 않았다. GA4 수신 검증은 완료했으며, 이 작업 뒤 다음 체크리스트 항목은 시작하지 않는다.

### 운영 활성화와 인수 확인

- [ ] 실제 배포 브랜치·빌드 경로·공개 렌더링 방식이 계획과 일치한다.
- [ ] 운영 측정 ID·동의 정책·맞춤 측정기준·향상된 측정 설정을 기록한다.
- [ ] PR 검증, 배포 성공, 실제 공개 페이지 측정 수신을 각각 확인한다.
- [ ] GA 보고서 반영 후 글별 조회수·참여 시간·Exits·진행률·이동 정보를 확인한다.
- [ ] 확인하지 못한 항목은 미완료로 남긴다. 기능 완료 보고 뒤 다음 체크리스트 항목을 자동 시작하지 않는다.

이번 stage 검증은 테스트 전용 ID와 검증 origin으로 사이트 Worker만 배포했다. 운영 속성 설정·운영 측정 ID 활성화·운영 배포는 수행하지 않았다.

## 10. 중단과 되돌리기

측정을 끄려면 production에서는 `GA4_PRODUCTION_ENABLED`를 false/unset으로 두거나 운영 측정 ID를 빌드에서 제외하고 사이트를 다시 빌드·배포한다. 외부 Google 스크립트와 수집 요청이 없어지는지 확인한다. 필요하면 분석 코드 변경만 되돌린다.

콘텐츠 DB·R2·글 발행 경로를 바꾸지 않으므로 분석 기능 중단에 데이터 복원 작업은 필요하지 않다. 이미 GA에 수집된 데이터는 코드 롤백으로 삭제되지 않는다.

#### 2026-10-02 구현·빌드·stage 회귀 기록

- 작업 브랜치: 별도 `codex/ga4-analytics`, 시작 커밋 `e55afb3` (`origin/main`과 동일). 기본 체크아웃 `codex/github-actions-deploy`의 변경 파일은 수정하지 않았다. 현재 feature branch 수정은 커밋하거나 PR을 만들지 않았다.
- 기본 구성으로 `pnpm build` 성공: 정적 HTML 326개. `GA4_EXPECTED_TARGET=disabled node scripts/verify-analytics.mjs` 통과, 분석 ID 포함 페이지 0개.
- stage 허용 조합(`G-8SFTFGKZ9Y`, 정확한 stage origin, `ALLOW_INDEXING=true`)으로 로컬 빌드 성공: 공개 글 125개에만 stage 표식. stage ID를 production origin과 활성 설정으로 빌드하려 하면 `Production GA4 settings do not match the approved build` 오류로 거부됐다.
- stage origin과 ID는 맞아도 `ALLOW_INDEXING`이 비어 있으면 표식이 0개였다. 실제 stage 응답은 `noindex,nofollow`라 이 보호를 유지했다.
- `pnpm check`: 오류 0, 경고 0, 기존 hint 6개. `prettier --check`, `git diff --check`, 최종 disabled-artifact/mock 검증도 통과했다. 빌드에는 기존 CSS 최적화 경고 5개가 있었다.
- `codex/ga4-analytics` 작업 트리의 `Build static site` 단계는 PR/default-off, main-only production ID 주입과 분석 산출물 검증을 설정한다. 2026-10-02 확인 시 `GA4_PRODUCTION_MEASUREMENT_ID=G-RQ6456HXLD`만 저장소 변수로 설정되어 있었고, `GA4_PRODUCTION_ENABLED`와 `ALLOW_INDEXING`은 없었다. 이 변수 상태만으로는 GA 수집이 활성화되지 않는다. 분석 workflow 변경은 해당 작업 트리에 미커밋 상태이고 기본 브랜치 workflow에는 아직 반영되지 않았으며, 이를 소비하는 Actions run도 없다.
- 이번 변경 후 stage 사이트 Worker를 배포했다. 새 버전 `a1d590c5-30dc-4a15-a6f0-18803de0b800`이 stage traffic 100%를 받는다. CMS는 배포하지 않았고 기존 stage CMS binding을 유지했다.
- stage 공개 글 Network 문서는 200이었다. robots는 `noindex,nofollow`, HTML 측정 ID/environment 표식은 없었다. `google-analytics.com`과 `googletagmanager.com` Network 필터 모두 0건(총 21 request 중)이었다.
- DebugView에는 현재 방문으로 만들어진 새 device/event가 없었다. 이전 검증 때 확인한 과거 `page_view`는 남아 있었으나 새 코드의 수신으로 보지 않았다. 새 코드에서 실제 stage `page_view`·`article_progress`·`article_navigation`의 양성 수신은 미완료다. 이를 확인하려고 noindex를 해제하거나 인덱싱 설정을 바꾸지 않았다.
- 운영 스트림 정보 `devlog-product` / `15942609257` / `G-RQ6456HXLD`는 사용자가 제공했다. 기존 운영 GA 설치, 해당 스트림의 속성 연결·설정, 동의 정책, GA 맞춤 정의와 보고서, production Network/Realtime은 확인하지 않았다. 운영 속성 변경·production ID 활성화·production 배포는 하지 않았다.

## 11. 다음 대화 인계 요청

> `docs/analytics-implementation-plan.md`를 읽고 GA4 프로덕션 모니터링 준비 상태를 이어서 정리해줘. 사용자가 제공한 운영 스트림은 `devlog-product`, URL `https://seungjun.sh`, 스트림 ID `15942609257`, 측정 ID `G-RQ6456HXLD`다. 이 정보를 production 전용 빌드 변수로 사용할 준비만 하고, GA 속성에서 실제 연결과 기존 운영 수집 상태는 확인 전까지 미확인으로 기록해줘. 테스트 ID `G-8SFTFGKZ9Y`는 production에 재사용하지 마. stage의 noindex 보호를 유지하고, GA 속성 설정 변경·운영 ID 활성화·production 배포는 사용자의 별도 명시 지시 전 하지 마. 출시 전 필요한 동의/개인정보 결정, `ALLOW_INDEXING` 승인, GA 측정 설정과 이벤트 매개변수 준비를 구체적으로 안내해줘. 다음 체크리스트 항목은 자동 시작하지 말고 운영 글·초안·이미지를 테스트 데이터로 수정하거나 삭제하지 마.

## 12. stage 검증에서 프로덕션 모니터링까지

### 2026-10-02 GA 수신 기록 (현재 완료 증거와 구분)

- `devlog-test` 속성/스트림에서는 stage의 테스트 `page_view`가 DebugView에 도착한 것을 확인했다. Network의 `collect` 요청도 `tid=G-8SFTFGKZ9Y`로 전송되고 성공 응답을 받았다.
- 이는 테스트 스트림과 stage만 증명한다. 프로덕션 수신은 이 작업에서 켜거나 검증하지 않았다. 기존 프로덕션 GA 설치 상태는 미확인이다.
- GA4 **Realtime**은 최근 5분·30분 활동을 확인하는 운영 화면이고, **DebugView**는 debug mode로 표시된 기기의 이벤트 매개변수 점검 화면이다. 현재 stage `#ga_debug` 동작을 프로덕션 전체 사용자에게 적용하지 않는다. (공식 안내: [Realtime 보고서](https://support.google.com/analytics/answer/9271392?hl=en), [DebugView](https://support.google.com/analytics/answer/7201382?hl=en))

### 단계별 실행 계획

| 단계                  | 해야 할 일                                                                                                                                                                                                                                                                                                            | 완료 증거                                                                | 승인 경계                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 운영 속성 준비     | 사용자가 제공한 `devlog-product` / `https://seungjun.sh` / `15942609257` / `G-RQ6456HXLD`가 실제 GA 속성의 운영 스트림과 연결되는지 읽기 확인한다. 속성·스트림 이름, timezone, 현재 데이터 필터, 향상된 측정 설정, 필요한 GA 편집 권한을 기록한다.                                                                    | 운영 도메인과 연결된 측정 ID 및 설정 요약                                | GA 계정 설정 변경은 별도 요청 전 보류                                                                                                                                                                     |
| 2. 수집 정책 확정     | 동의/개인정보 처리와 내부 개발 트래픽 처리 방식을 확인한다. page_view는 기본 페이지 로드 한 경로만 사용하고 브라우저 기록 변경 자동 page_view와 중복되지 않도록 정한다.                                                                                                                                               | 승인된 설정 결정표                                                       | 법률 판단을 추정하지 않는다                                                                                                                                                                               |
| 3. 코드·CI 준비       | stage 전용 상수/해시 게이트를 환경별 ID·origin 검증으로 바꿨다. 기본/PR은 ID 없이 빌드하고, stage 빌드만 테스트 ID, 운영 활성화 뒤 production 빌드만 운영 ID를 전달하도록 준비했다. progress/navigation 이벤트도 구현했다.                                                                                            | build 산출물 검사, 모의 이벤트, `pnpm check` 결과는 2026-10-02 기록 참조 | 운영 ID는 현재 비활성, 운영 변경 없음                                                                                                                                                                     |
| 4. stage 회귀         | noindex를 포함한 새 버전을 stage에서 확인했다. 현 stage는 noindex라 GA 요청이 없는 것이 기대 동작이다. 두 맞춤 이벤트의 실제 수신은 indexable 격리 검증 경로가 없어 미완료다.                                                                                                                                         | Network 필터 0건과 DebugView 새 이벤트 없음                              | 운영 ID를 stage에 넣지 않고 noindex를 해제하지 않는다                                                                                                                                                     |
| 5. 운영 출시 승인     | 운영 ID, 개인정보/동의 결정, 배포 커밋, 되돌리기 방법을 사용자가 확인한다. 운영 ID 활성화와 production 배포는 사용자의 별도 명시 요청을 받은 뒤에만 진행한다.                                                                                                                                                         | 승인받은 ID·커밋·배포 범위                                               | 이 단계 전까지 운영 변경 금지                                                                                                                                                                             |
| 6. 프로덕션 수신 확인 | 승인된 배포 뒤 production hostname에서 문서 응답, GA 스크립트, 수집 요청의 측정 ID와 `page_view` 매개변수를 확인한다. GA4 Realtime에서 production 페이지/이벤트를 대조한다. 개인 기기 DebugView 점검이 필요하면 해당 기기에만 Tag Assistant로 debug mode를 켜고, 개발자 트래픽 제외는 우선 Testing 상태에서 확인한다. | Network와 Realtime 증거, 테스트 기기 DebugView 증거(사용한 경우)         | Debug traffic exclusion을 곧바로 Active로 하지 않는다. GA는 Active 제외 필터가 수집 데이터에 영구 적용된다고 안내한다. ([개발자 트래픽 필터](https://support.google.com/analytics/answer/13296662?hl=en)) |
| 7. 보고서 확인        | 기본 보고서에서 page path별 views·users·average engagement time을 확인한다. 맞춤 탐색에서 `article_progress`, `article_navigation` 및 등록된 매개변수를 점검한다. 맞춤 측정기준은 등록과 데이터 수집 후 보고서 사용 가능까지 24–48시간이 걸릴 수 있다.                                                                | 실시간 확인과 표준 보고서 확인을 분리한 결과표                           | 지연 중 항목은 미완료로 표시                                                                                                                                                                              |
| 8. 완료·인계          | 실제 배포 버전, production 데이터 수신, 제외 경로, 주요 이벤트, 미확인 보고서를 기록한다.                                                                                                                                                                                                                             | 증거가 연결된 완료 보고                                                  | 다음 체크리스트는 자동 시작하지 않는다                                                                                                                                                                    |

### 운영 모니터링 기준

- **즉시 확인:** GA4 Reports → Realtime에서 최근 30분 active users, page views와 event count를 본다. 여기서는 수집 직후의 동작을 확인하며 장기 추세 판정에는 쓰지 않는다.
- **개발자 점검:** DebugView는 debug mode 이벤트의 매개변수 확인용으로만 사용한다. 모든 방문자에게 `debug_mode`를 켜지 않는다. 개발자 트래픽 필터는 먼저 Testing으로 확인하고, 제외 상태를 활성화하려면 그 영구 효과를 별도 검토·승인한다.
- **추세 확인:** 표준 보고서/탐색에서 글별 조회수·사용자·참여 시간과 본문 도달·이동 이벤트를 본다. 평균 참여 시간은 읽은 시간의 직접 측정값으로 부르지 않고, 도달 이벤트도 글을 읽거나 이해했다는 증거로 해석하지 않는다.
- **이벤트 변수:** `progress_percent`, `navigation_direction`, `target_path`만 등록한다. 개인 식별자, 폼 입력, 검색어, 초안 본문, 쿼리 토큰은 보내지 않는다.
- **완료 조건:** 올바른 운영 ID로 Network 수신, Realtime의 production 활동, 제외 페이지 무수집, 보고서의 기본/맞춤 이벤트가 각각 확인되어야 프로덕션 모니터링 완료로 기록한다.

### 2026-10-02 production 변수 준비와 출시 전 결정

- GitHub Actions 저장소 변수 `GA4_PRODUCTION_MEASUREMENT_ID`를 사용자가 제공한 `G-RQ6456HXLD`로 설정했다. 이는 비밀값이 아닌 측정 ID다.
- 같은 시점의 저장소 변수 목록에서 `GA4_PRODUCTION_ENABLED`와 `ALLOW_INDEXING`은 설정되지 않았다. `GA4_PRODUCTION_ENABLED`가 `true`가 아니면 feature workflow는 ID를 빌드에 전달하지 않는다. `ALLOW_INDEXING`이 없으면 indexable 상태와 analytics 표식도 생성하지 않는다. 현재 기본 브랜치 workflow에는 analytics 입력이 없고 feature 변경은 미커밋이므로, 설정한 ID는 production 빌드에서 아직 사용되지 않았다.
- stage의 기존 noindex 보호를 바꾸지 않았다. 문서에 기록된 마지막 stage 확인은 `noindex,nofollow`와 analytics 요청 0건이다. 이번 작업에서 stage 설정을 변경하거나 production 페이지의 Network/GA 수신을 확인하지 않았다.
- 운영 스트림 실제 속성 연결, 현재 향상된 측정/필터 설정, 기존 운영 사이트 수집 상태, 동의 설정은 계속 **미확인**이다. ID는 사용자가 제공한 값으로만 기록하며 GA 속성을 조회하거나 변경하지 않았다.
- GA 속성 연결 확인, 운영 ID 활성화, `ALLOW_INDEXING` 설정, production 배포는 별도 명시 지시 전까지 보류한다. 다음 체크리스트 항목도 시작하지 않는다.

#### 출시 전에 결정할 항목

1. **개인정보·동의 정책 승인:** 사이트 운영자가 분석 목적, 실제 전송되는 페이지/이벤트 정보, 보관·사용자 요청 처리, 대상 지역·언어, 개인정보 안내의 반영 여부를 정하고 운영 정책과 현재 지침을 대조한다. 적용 법률이나 동의 배너 필요 여부는 여기서 단정하지 않는다. 동의 필요성과 허용 방식이 결정되지 않아 현재 코드는 출시 준비가 아니다. 현재 분석 코드에는 방문자 동의 게이트나 Consent Mode가 없다. Google의 Consent Mode에서 basic 방식은 사용자가 선택하기 전 태그를 막지만, advanced 방식은 동의 거부 상태에서도 제한된 측정 신호를 보낼 수 있으므로 어느 방식이 승인 정책에 맞는지 먼저 선택한다. 사용자 선택 저장, 페이지 간 반영, 거부 및 철회 처리를 포함하고, 선택이 필요한 경우에는 정책에 맞춰 초기 consent 상태가 측정 명령보다 앞서도록 구현한다. 참고: [개인정보보호위원회 개인정보 처리방침 작성지침(2026.4 개정)](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=&nttId=12018), [Google Consent Mode 웹 설정](https://developers.google.com/tag-platform/security/guides/consent), [basic·advanced 비교](https://developers.google.com/tag-platform/security/concepts/consent-mode).
2. **검색 인덱싱 승인:** production 사이트를 검색엔진에 공개할지 별도로 승인한다. 승인 후 production 빌드에만 `ALLOW_INDEXING=true`를 설정하고, 실제 공개 경로의 `robots` meta와 `/robots.txt`를 확인한다. 지금은 이 변수를 설정하지 않는다. stage에는 계속 noindex를 적용한다.
3. **GA 설정 읽기 확인과 변경 승인:** 실제 속성에서 `devlog-product`, `https://seungjun.sh`, 스트림 ID `15942609257`, 측정 ID `G-RQ6456HXLD`가 서로 연결되는지 확인한다. 향상된 측정은 페이지 로드 기반 조회만 사용하고 browser history 변경 page_view와 기본 scroll은 끄는 구성을 목표로 검토한다. 현재 값과 다를 경우 사용자의 별도 승인 전에는 변경하지 않는다. 광고 개인화와 Google Signals는 이번 범위에서 켜지 않는다.
4. **이벤트·보고서 준비:** 기본 `page_view`는 origin + pathname만 전송하며 query/hash는 제외한다. `article_progress`는 `progress_percent`에 `25`, `50`, `75`, `90`을 보낸다. `article_navigation`은 `navigation_direction`에 `previous`/`next`, `target_path`에 같은 사이트의 `/blog/.../` 경로를 보낸다. GA4 보고용 이벤트 범위 맞춤 측정기준은 이 세 매개변수로 제한하고, 글 경로는 기본 page path로 나눈다. 해당 등록과 보고서 구성은 GA 속성 변경 승인을 받은 뒤 수행한다.
5. **운영 활성화와 배포 승인:** 개인정보/동의 결정, 인덱싱 승인, 속성 설정 확인, 이벤트 정의, 배포 커밋과 되돌리기 계획을 한 번에 검토한다. 운영 활성화는 `GA4_PRODUCTION_ENABLED=true`와 승인된 운영 ID를 함께 적용하는 별도 단계이며, production 배포도 별도 명시 지시가 있어야 한다.

## 13. 2026-10-03 후속 작업과 남은 출시 조건

### 직접 확인한 현재 상태

- 원격 main은 `e55afb3d31821b0efb7ebf57b391cd3ef78fcb71`이다. `wrangler.jsonc`는 `CONTENT_READS=true`와 `/blog/*` Worker 우선 실행을 설정한다. Worker는 CMS의 공개 글 응답을 `/article-template/`에 합성한다. 기존 정적 ArticleLayout만 수정하는 방식으로는 이 경로에 분석이 붙지 않는다.
- 기존 `codex/ga4-analytics`는 다른 채팅 소유라 새 관리 작업 트리에 기존 분석 diff와 신규 스크립트를 복사했다. 원래 분석 작업 트리와 기본 폴더의 편집기 등 사용자 변경은 보존했다.
- GitHub 저장소 변수에는 `GA4_PRODUCTION_MEASUREMENT_ID=G-RQ6456HXLD`가 있고 `GA4_PRODUCTION_ENABLED`, `ALLOW_INDEXING`은 없다. 변수는 변경하지 않았다.
- 실제 production 글 응답과 stage 글 응답의 robots는 둘 다 `index,follow`였다. 둘 다 활성 `data-analytics-measurement-id`는 없었다. stage 글의 현재 브라우저 DOM에도 본문 분석 표식과 Google 외부 script 요소가 없었다. HTML 안에 번들 코드 문자열이 있다는 것과 실제 태그 초기화는 구분한다. 이번 HTTP·DOM 확인으로 Network collect 수신을 증명하지 않는다.
- production HTTP 표본: `/blog/%ED%8C%A9%ED%86%A0%EB%A6%AC-%EB%A9%94%EC%84%9C%EB%93%9C%EC%97%90-%EB%8C%80%ED%95%98%EC%97%AC/`; stage 표본: `/blog/React%EC%9D%98-%EC%98%81%EC%9B%90%ED%95%9C-%EC%88%99%EC%A0%9C-Stale-Closure-%EC%99%84%EB%B2%BD-%EC%9D%B4%ED%95%B4%ED%95%98%EA%B8%B0/`.

### 운영 GA 읽기 확인

[운영 스트림 관리 화면](https://analytics.google.com/analytics/web/#/a410455528p557066996/admin/streams/table/15942609257)에서 확인했다. 설정은 저장하거나 변경하지 않았다.

| 항목                                      | 실제 확인 값                                                               | 남은 조치                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 계정 / 속성                               | `devlog-product` / `410455528` / `557066996`                               | 연결 확인 완료                                                    |
| 스트림                                    | `devlog-product`, `https://seungjun.sh`, `15942609257`, `G-RQ6456HXLD`     | 연결 확인 완료                                                    |
| 보고 시간대                               | 대한민국, GMT+09:00                                                        | 확인 완료                                                         |
| 수신 안내                                 | 최근 48시간 동안 수신한 데이터 없음                                        | 활성화 뒤 Network와 Realtime 별도 검증                            |
| 향상된 측정                               | 활성. 페이지 조회·스크롤·이탈 클릭·사이트 검색·양식·동영상·다운로드가 켜짐 | 필수 페이지 로드 외 수집 범위를 승인 후 조정                      |
| 브라우저 기록 page_view                   | 켜짐                                                                       | 승인 후 끔                                                        |
| 기본 scroll                               | 켜짐                                                                       | 승인 후 끔                                                        |
| 데이터 수정                               | 이메일 활성, URL 쿼리 매개변수 키 비활성                                   | 자동 이벤트의 URL/링크 매개변수 유출 여부를 실제 Network에서 검증 |
| 내부 트래픽 필터                          | `Internal Traffic`, 제외, Testing                                          | 실제 내부 트래픽 정의 확인. Active로 바꾸지 않음                  |
| 맞춤 측정기준                             | 0개                                                                        | 승인 후 아래 3개 등록                                             |
| GA 사용자 역할 / 광고·Signals / 동의 정책 | 이번에 직접 확인하지 않음                                                  | 출시 전 확인                                                      |

등록할 이벤트 범위 측정기준은 `progress_percent`, `navigation_direction`, `target_path`이며 기존 이벤트 계약을 유지한다. 새 계정·속성·API 비밀번호를 만들 필요는 없다.

### 수정한 구현

- BaseLayout이 승인된 빌드 ID·origin·환경·인덱싱 조건을 템플릿용 비활성 속성에 전달한다. 내부 템플릿 자체는 noindex이며 외부 요청은 Worker에서 404다.
- Worker는 성공한 공개 D1 글 응답에서만 템플릿 설정을 활성 분석 속성으로 변환한다. 요청 origin과 Worker SITE_ORIGIN도 일치해야 한다. 템플릿 메타데이터는 응답에서 제거한다.
- D1 본문과 Worker가 만드는 이전/다음 링크에도 분석 표식을 붙였다. D1 글의 robots는 빌드 인덱싱 조건을 따르며, 더 이상 무조건 `index,follow`로 바꾸지 않는다. 다른 페이지의 robots 동작은 이번 수정 범위 밖이다.
- 빌드·Worker·클라이언트 모두 운영 ID를 `G-RQ6456HXLD`로 제한한다. 클라이언트는 robots의 noindex/none 또는 robots 누락에도 초기화하지 않는다.
- Google 설치 예제와 동일하게 gtag 큐에 `arguments` 객체를 넣도록 수정했다. 기존 모의 테스트는 배열 큐만 검사해서 이 프로토콜 차이를 잡지 못했다. 실제 Google 수신 성공은 아직 주장하지 않는다. [Google 설치 코드](https://developers.google.com/tag-platform/gtagjs)
- 링크 목적지가 글 목록 `/blog/`이면 이동 이벤트를 보내지 않는다. 기존 query/hash 제외, stage debug 해시, 본문 구간 중복 방지, 링크 기본 동작을 유지한다.
- CI에 예상 분석 환경 산출물 검사와 실제 Workers HTMLRewriter 기반 검증을 연결했다. 일반 PR은 기본 무수집이고 production 설정은 main push에서만 전달한다.

### 검증 결과

- `pnpm check`: 오류 0, 경고 0, 기존 hint 6개.
- 기본 무수집 빌드: HTML 326개, 활성 분석 ID 포함 0개. `GA4_EXPECTED_TARGET=disabled node scripts/verify-analytics.mjs` 통과.
- production 허용 조합 로컬 빌드: HTML 326개, 정적 글 125개와 런타임 템플릿에 승인 ID 설정. `GA4_EXPECTED_TARGET=production` 검증 통과.
- stage 허용 조합 로컬 빌드: HTML 326개, 정적 글 125개와 런타임 템플릿에 테스트 ID 설정. `GA4_EXPECTED_TARGET=stage` 검증 통과.
- 최종 배포 빌드: stage origin/test ID를 지정하되 `ALLOW_INDEXING`과 운영 flag를 비워 HTML 326개, 활성 ID 0개와 런타임 비활성 설정을 확인. Google 요청은 만들지 않았다.
- `node scripts/verify-analytics-runtime.mjs`: 설치된 Miniflare/Workers HTMLRewriter로 빌드 템플릿과 합성 CMS 글을 사용했다. production/stage 활성 조합, noindex, 잘못된 ID/환경/origin, D1 404/503, 내부 템플릿 404, 본문과 링크 표식을 검증했다. 실제 GA 수신 검증은 아니다.
- 클라이언트 모의 검증: 큐의 Arguments 형식, 승인 ID, query/hash/noindex 제외, production debug 없음, 본문 없음·높이 0·짧은 글·resize·이미지·숨김·복원, 구간 중복 제외, 이전/다음/보조 클릭, 목록/외부 링크 제외와 기본 이동 보존 통과.
- 기존 CI 명령 `verify-image-cleanup`, `verify-d1-routes`, `verify-series-pagination`, `verify:content`, `verify:search`, `verify:security` 모두 통과.
- 변경 파일 Prettier 검사와 `git diff --check` 통과. 빌드 CSS 최적화 경고 5개는 남아 있다.

### stage 배포 후 증거

- 사이트만 배포: `pnpm exec wrangler deploy --env stage --message 'GA4 D1 article guards and noindex stage regression'`.
- 배포 전 사이트 `a1d590c5-30dc-4a15-a6f0-18803de0b800`, 배포 후 사이트 `6a3c6752-ec97-44c8-b7e3-78a4c4a5ffd4`의 traffic 100%를 `deployments status --env stage`로 확인했다.
- CMS는 배포 전후 `5be07cf7-bf18-4792-88c1-adcd49a44ab9` 100%로 유지됐다. 사이트 바인딩은 `devlog-cms-stage`다. 운영 Worker/CMS·D1·R2 변경은 없다.
- `SITE_ORIGIN=https://devlog-site-stage.seungjun-jeong10.workers.dev node scripts/verify-deployment.mjs` 통과: 공개 API·검색 200, 익명 세션/관리 API 401, 로그인 CSP·DENY·nonce 일치.
- stage 글 HTTP 200, `robots=noindex,nofollow`, 활성 GA ID 없음, 본문 표식 존재, 이전 글 표식 1개. `/article-template/` 404. 로그인·stage preview 편집기 200이지만 관리 API는 익명 401이었다.
- Chrome stage `#ga_debug`를 새로고침한 뒤 DOM에서도 noindex/nofollow, 활성 GA ID 없음, 본문/이전 글 표식, 외부 Google script 요소 0개를 확인했다. 이번에는 DevTools Network나 DebugView 양성 수신을 확인하지 않았다.
- 되돌릴 경우 기존 사이트 버전과 stage CMS 바인딩을 조회한 뒤 사이트만 복구한다. 이전 버전은 강제 index,follow 문제를 다시 만들 수 있으므로 이를 정상 noindex 결과라고 기록하지 않는다. DB/R2 복구 작업은 이번 변경에 필요하지 않다.

### 방문자 동의 구현 후속 작업

사용자가 2026-10-03에 **동의 전 태그를 로드하지 않고, 동의한 방문자만 수집**하는 방식을 선택했다. 이를 basic 방식으로 구현했다. 운영 활성화나 배포 승인은 별도로 유지한다.

- `AnalyticsConsent.astro`에 비차단 동의 패널과 페이지 아래 ‘방문 통계 설정’을 추가했다. 허용/거부를 같은 형태로 제공하며, 설정을 다시 열고 철회할 수 있다. 선택이 없을 때 배너는 모든 분석 조건이 맞는 글에서만 표시한다. 저장된 선택은 다른 공개 페이지에서도 변경할 수 있다.
- 선택은 origin별 `localStorage`의 `devlog.analytics-consent.v1`에 `granted`/`denied`로 저장한다. 선택 없음·거부·알 수 없는 값·저장 실패에는 수집을 시작하지 않는다.
- 허용한 뒤에만 consent default(모두 denied), consent update(analytics_storage만 granted), js/config를 큐에 넣고 Google 태그를 요청한다. 광고 관련 동의는 계속 denied다. [Google basic consent 안내](https://developers.google.com/tag-platform/security/concepts/consent-mode#basic_consent_mode)
- 철회하면 저장된 허용을 바꾸고 Google opt-out 표식·플래그를 설정한다. 자체 이벤트 큐를 멈추고 해당 호스트의 GA 쿠키만 만료시킨다. 태그가 실행 중이었다면 새로고침해 완전히 내려받지 않은 문서로 전환하며, denied 상태 측정 ping은 직접 보내지 않는다. GA config의 cookie_domain은 실제 호스트, cookie_path는 `/`로 제한한다.
- storage 이벤트와 pageshow에서 선택을 재확인해 다른 탭의 철회와 BFCache 복원에도 반영한다. 저장 실패 시 기존 허용 제거를 시도하고 현재 페이지를 무수집으로 유지한다.
- 모의 검증에 최초 방문/저장된 거부/명시적 허용/중복 허용/철회/쿠키 만료/저장 실패/다른 탭/BFCache/consent 명령 순서를 추가해 통과했다. 최종 `pnpm check`는 85파일, 오류 0·경고 0·기존 hint 6개다.
- 합성 로컬 브라우저 검증에서 최초 무태그, 거부 후 새로고침 무태그, 키보드 허용 뒤 로컬 태그 대체물 로딩, 철회 뒤 새 문서 무태그, 다른 공개 페이지의 설정 접근을 확인했다. 이 fixture는 origin/protocol을 로컬로 치환하고 Google 태그 대신 로컬 stub을 사용한다. 실제 Google/DebugView 수신 검증이 아니다.
- 실제 Google tag JavaScript를 읽어 `data-google-analytics-opt-out`와 `ga-disable-` 검사 분기를 확인했다. 실제 철회 전후 Google Network와 쿠키 동작은 격리된 양성 브라우저 검증에 남겨 둔다.
- 허용 조합 로컬 빌드와 최종 stage 무수집 빌드, GA 모의/Workers 검증, 보안 검사, 변경 파일 포맷 검사를 통과했다. 동의 UI가 있다는 사실을 개인정보 안내나 적용 법률 전체의 확정으로 취급하지 않는다.
- 동의 구현과 저장 실패 후 재허용 처리를 포함한 최종 stage 사이트 버전은 `37d3e3a2-49b2-4140-9ffc-e3757be88815`다. `deployments status --env stage`에서 traffic 100%를 확인했으며 CMS는 `5be07cf7-bf18-4792-88c1-adcd49a44ab9` 100%로 유지됐다. 배포 후 `verify-deployment.mjs`를 다시 통과했다.
- 최종 stage 글을 Chrome에서 새로고침해 `robots=noindex,nofollow`, 활성 분석 ID 없음, Google 외부 script 요소 0개, 본문 표식 존재를 확인했다. 동의 패널과 설정 버튼도 숨김 상태였다. noindex 환경에서 동의 UI가 수집 보호를 우회하지 않는다. 실제 Network 수신 검증은 아니다.

### 아직 완료하지 않은 항목

- [x] 사용자 선택에 따른 basic 동의·거부·저장·철회 UI와 측정 게이트 구현.
- [ ] 운영 개인정보 안내의 내용·보관·요청 처리 등 전체 정책 확정. 기술적인 동의 방식 선택만으로 이를 승인받았다고 판단하지 않는다.
- [ ] 운영 GA의 향상된 측정 조정과 맞춤 측정기준 3개 등록. 자동 수집 범위와 내부 트래픽 정의/사용자 역할도 함께 확인한다.
- [x] 수정된 stage 사이트 배포, traffic 100%, 글 noindex·분석 제외와 인증/보안 smoke 확인.
- [ ] noindex 보호를 해제하지 않는 격리 검증 방법을 정한 뒤 긴/짧은/이미지 글·클릭·키보드·BFCache·차단·민감 매개변수를 실제 브라우저에서 확인한다. 이번에는 두 맞춤 이벤트의 Network/DebugView 양성 수신을 확인하지 않았다.
- [ ] 별도 승인 뒤 운영 인덱싱·GA 활성화·production 배포. 승인 전 draft PR은 merge하지 않는다.
- [ ] 배포 후 Network, Realtime, 제외 페이지, 표준 보고서/맞춤 탐색 확인. 실제 수신과 지연 보고서 확인을 별개로 기록한다.

다음 대화는 이 13절부터 이어서 위 미완료 항목만 진행한다. 다음 안정화 체크리스트 항목은 자동 시작하지 않으며 운영 글·초안·이미지를 테스트 데이터로 수정하거나 삭제하지 않는다.

### 운영 개인정보 안내 준비 — 2026-10-03 이번 요청

**결과: 공개 경로 초안과 동의 UI 연결의 로컬 준비 완료. 전체 정책 확정·출시 완료는 아님.** 이번 요청은 이 항목에만 한정했다. GA 설정·GitHub 활성화 변수·인덱싱 변수 변경, PR merge, stage/production 배포는 하지 않았다. 아래 기록은 앞의 동의 구현·stage 배포 기록과 별개다.

#### 시작 상태와 보존

- 기본 폴더의 이 문서 13절과 적용되는 `/Users/seungjun/.codex/AGENTS.md` 및 사용자 제공 지시를 읽었다. 기본 폴더·구현 트리 안에는 별도 AGENTS.md가 없었으며 상위 경로도 확인했다.
- 구현 트리: `/Users/seungjun/.codex/worktrees/ga4-completion/devlog`, 브랜치 `codex/ga4-completion`, 시작 HEAD `e8a22d38c093514d34fb1b3489db1a0a1a562dc7`, 시작 working tree는 clean.
- `gh auth status`, `gh pr view 34`로 [PR #34](https://github.com/whateveriiwant/devlog/pull/34)의 OPEN/draft, 위 head, `main` 대상, 기존 build SUCCESS를 확인했다. 이는 이번 로컬 변경의 CI 성공이 아니다.
- 기본 폴더의 `.gitignore`, 편집기·CSS·레이아웃·작성 결정 문서 등 기존 변경은 유지한다. 계획 문서는 기존 내용을 덮어 복사하지 않고 이 결과 절만 두 위치에 추가한다. 이번 코드 변경은 구현 트리의 `src/pages/privacy.astro`와 `src/components/AnalyticsConsent.astro`에만 있다. 커밋·push는 하지 않았으므로 PR 원격 diff에는 아직 이 초안이 없다.

#### 실제 코드와 GA 화면에서 읽기 확인한 사실

코드 근거: `src/scripts/analytics.ts`, `src/components/AnalyticsConsent.astro`, `src/layouts/BaseLayout.astro`, `worker/site.mjs`, `src/components/SiteControls.tsx`. 운영 GA 계정 `410455528` / 속성 `557066996`의 스트림·향상된 측정·데이터 보관·데이터 수집 화면을 실제 브라우저로 읽었다. switch/checkbox/combobox는 바꾸지 않았고 저장·사용 설정 버튼은 누르지 않았다.

| 구분           | 이번 직접 확인                                                                                                                                                | 안내 반영 / 제한                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 운영 연결      | `devlog-product`, `https://seungjun.sh`, 스트림 `15942609257`, `G-RQ6456HXLD`; 최근 48시간 수신 없음 안내                                                     | 활성화·수신 성공을 뜻하지 않음                                                                                                                         |
| basic 동의     | 선택 없음·거부·저장 실패에는 태그를 로드하지 않음. 허용 뒤 consent default/update → js/config → 외부 태그 요청                                                | 승인된 방식을 유지; 광고 동의 denied, Signals/광고 개인화 신호 false                                                                                   |
| 수집 경로      | 승인 ID/origin·빌드·robots 조건을 통과한 공개 `/blog/.../` 글. query가 있거나 production hash가 있는 최초 URL은 초기화 제외                                   | 로그인·편집기·관리·안내 페이지는 제외                                                                                                                  |
| 자체 전송 값   | page_location/referrer는 origin+pathname, page_title=`devlog`; 진행률 25/50/75/90; previous/next와 같은 사이트 target_path                                    | 맞춤 코드가 사용자 ID·검색어·폼 내용·본문 등을 추가하지 않는다는 범위로 한정                                                                           |
| 자동 수집      | 향상된 측정 활성. 페이지 로드/히스토리 조회, 기본 스크롤, 이탈 클릭, 사이트 검색, 양식, 동영상, 다운로드 모두 켜짐. 이메일 수정 활성, URL 쿼리 키 수정 비활성 | 자동 이벤트의 link_url/search_term/form_destination 등은 별도 범위. 실제 수집을 두 맞춤 이벤트만으로 안내하지 않음. GA 설정 조정은 다음 별도 승인 범위 |
| GA 데이터 보관 | 이벤트 **2개월**, 사용자 **14개월**, 새 사용자 활동 시 재설정 **켜짐**                                                                                        | 사용자가 유지한다고 답변. 집계 보고서 전부의 삭제 기한으로 쓰지 않음                                                                                   |
| GA 데이터 수집 | Google 신호와 사용자 제공 데이터는 ‘사용’ 버튼이 보이는 미활성 상태. 세부 위치/기기 수집 켜짐, **307/307 지역** 허용                                          | 도시 수준 위치·기기 정보 가능성을 포함. 계정 전체 데이터 공유·광고 링크/내보내기 설정은 미확인                                                         |
| 선택 저장      | origin별 localStorage `devlog.analytics-consent.v1`, `granted`/`denied`; 자동 만료 없음                                                                       | 브라우저/기기/주소별 선택, 사이트 데이터 삭제 후 재선택. `theme` 저장과 구분                                                                           |
| GA 쿠키        | 코드 cookie_domain은 현재 hostname, path `/`; 철회 시 `_ga`, 운영·stage 컨테이너 쿠키 만료 시도                                                               | Google 공식 기본 만료 2년과 실제 브라우저/GA 만료를 구분. 태그 관리의 쿠키 override와 실제 생성·삭제 결과는 미검증                                     |
| 철회           | 거부 저장, opt-out/ga-disable, 자체 이벤트 중지, 쿠키 만료, 태그 실행 중이면 reload. storage/pageshow로 재확인                                                | 기존 전송 데이터의 자동 삭제로 설명하지 않음. 실제 Google Network 철회 검증은 이번 범위 아님                                                           |

#### 한 번에 질문한 정책과 사용자 답변

사용자 답변: **“이메일은 me@seungjun.sh로 해 보관 정책은 바꿀 생각 없어 해외 방문도 가능해”**.

- 문의·열람·삭제·처리정지 요청 이메일: `me@seungjun.sh` 반영. 운영자 이름은 기존 프로필의 정승준으로 표기. 기존 프로필 이메일 자체는 변경하지 않았다.
- 현재 GA 이벤트 2개월 / 사용자 14개월 / 새 활동 시 재설정 켜짐 유지. localStorage에는 기존처럼 자동 만료 로직을 추가하지 않았다.
- 해외 방문 가능 반영. 한국어 안내 준비. 해외 방문 가능 답변을 해외 법률 검토나 Google 국외 처리 조건 승인으로 해석하지 않았다.
- 답변하지 않은 정책은 임의 확정하지 않았다: 요청 접수·본인/브라우저 식별·열람/삭제/처리정지 절차, 응답 목표, 요청 메일·처리 기록 보관/파기, 집계 보고서·별도 내보내기 자료의 보관/삭제 정책.
- Google 계약 상대방·약관 적용/수락 여부, 국외 이전 국가·수령자 연락처·시점/방법·보관/이용 조건·고지/권리 행사 및 서버/보안 로그 등 전체 사이트 정책은 출시 전 확인 필요. 기본 동의 방식만으로 법률 준수를 확정하지 않는다.

#### 공식 자료 확인 범위

2026-10-03 검색·원문 열기로 아래 공식 자료의 관련 설명을 확인했다. 자료가 사이트 운영자의 정책을 대신 결정하지 않는다.

- [Google basic consent](https://developers.google.com/tag-platform/security/concepts/consent-mode#basic_consent_mode): 동의 전·거부 시 태그 차단과 데이터 미전송. 코드의 승인 방식 대조.
- [GA 수집 정보](https://support.google.com/analytics/answer/6004245?hl=en), [지역 수집/IP](https://support.google.com/analytics/answer/11598602?hl=en): 쿠키·브라우저/기기·활동 정보와 위치 산출 후 IP 폐기. ‘IP가 전달되지 않음’이나 완전 익명이라고 단정하지 않음.
- [GA4 쿠키](https://support.google.com/analytics/answer/11397207?hl=en): `_ga`/컨테이너 쿠키의 기본 2년, 브라우저 제한·override 가능. 운영 실제 만료 미확인으로 표시.
- [GA 보관](https://support.google.com/analytics/answer/7667196?hl=ko): 사용자 보관 재설정과 표준 집계 보고서의 범위 차이.
- [향상된 측정](https://support.google.com/analytics/answer/9216061?hl=en): 링크/검색/양식/동영상/파일 이벤트와 매개변수. 민감 매개변수 제외를 코드만으로 전체 보장하지 않음.
- [Google 처리 약관](https://business.safety.google/adsprocessorterms/): 일반 약관 문서와 실제 계정의 적용·수락은 별개. 계정에서 약관을 수락하거나 계약 내용을 확정하지 않음.
- [개인정보보호위원회 현재 안내서 게시판](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=&nttId=12018): ‘개인정보 처리방침 작성지침(2026.4. 개정)’, 게시일 2026-04-23, 적정·투명한 작성/공개를 위한 안내라는 게시문은 확인. 첨부 PDF 다운로드 이벤트는 timeout, HTTP 접근은 400으로 **PDF 본문은 읽지 못했다**. 게시문만으로 지침 세부 요구사항 검토 완료를 주장하지 않는다. PDF 내용은 현재 도구로 검증하지 못했다(I cannot verify this with the available tools). 출시 전 공식 첨부의 관련 부분을 읽어 전체 처리 범위와 대조해야 한다.

#### 준비한 공개 경로와 연결

- `src/pages/privacy.astro` → `/privacy/`: 분석 목적, 수집 정보, 선택 저장/쿠키, 보관, 거부·철회, 문의 창구, 미확정 요청 절차·국외 처리 고지와 공식 근거를 담은 초안. ‘운영 정책 확정 전’, ‘출시 전 확인 필요’를 명시하고 시행일은 확정하지 않음. `noindex`이고 분석 대상 아님.
- `AnalyticsConsent.astro`: 공통 하단의 개인정보 안내 링크는 선택 저장 여부와 무관하게 접근 가능. 동의 패널에도 수집·보관·철회 안내 링크를 연결. 기본 동의 게이트와 이벤트 로직은 수정하지 않음.
- Worker가 합성하는 D1 article-template에도 두 링크가 포함되는 빌드 산출물을 확인. 관리자 전용 화면에 새 GA 태그나 동의 UI를 추가하지 않음.
- 이 두 파일과 문서만 로컬 준비했으며 배포하지 않았다. 아직 전체 정책 확정 체크박스는 미완료로 유지한다.

#### 이번 로컬 검증 증거

- `pnpm check`: **86 files, errors 0, warnings 0, hints 6**.
- `pnpm build`: **327 pages**, 성공. 기존 CSS 최적화 경고 5개.
- `GA4_EXPECTED_TARGET=disabled node scripts/verify-analytics.mjs`: **327 HTML / enabled 0**, 기존 클라이언트 모의 consent/event guards 통과. Google 요청/수신 검증 아님.
- `node scripts/verify-analytics-runtime.mjs`: 실제 Workers HTMLRewriter + 합성 CMS fixture의 기존 활성/비활성·noindex·본문/이동·404/503 보호 통과. Google 요청 없음.
- 산출물 단언: `/privacy/` 제목, noindex/nofollow, 활성 분석 ID 없음, `mailto:me@seungjun.sh`, 미확정 표시, home/privacy/D1 template의 하단·동의 패널 링크 확인. 코드·HTML 검증이며 실 운영 검증 아님.
- 로컬 preview `http://127.0.0.1:4327/privacy/` HTTP **200**. Chrome에서 홈 하단 링크를 실제 클릭해 안내 초안으로 이동했고 연락처·미확정 항목을 DOM에서 읽음. 화면 상단/본문 표시 확인. robots noindex/nofollow, 활성 ID null, Google 외부 script **0**, 동의 패널 hidden. DevTools Network/GA 수신·실제 철회 테스트를 수행했다고 기록하지 않음.
- 두 코드 파일·인계 문서·추가한 계획 절의 Prettier 검사와 `git diff --check` 통과. 기본 폴더의 기존 tracked diff는 문서 추가 전후 `git diff --binary` 결과를 `cmp`로 비교해 동일함을 확인. 이번 변경의 원격 CI는 실행하지 않음.

#### 남은 결정과 종료 경계

- [x] 실제 코드·GA 화면에 근거한 개인정보 안내 초안과 공개 경로·동의 UI 링크 로컬 준비.
- [x] `me@seungjun.sh`, 현재 GA 보관 설정 유지, 해외 방문 가능 반영.
- [ ] 미확정 운영 정책, Google 국외 처리 고지/계약, 전체 사이트 처리 범위와 공식 지침 PDF 대조.
- [ ] 정책 확정 뒤 안내 최종 문안·시행일 승인. 전체 정책 확정과 출시 완료는 여전히 미완료.

다음 단계용 프롬프트는 `docs/analytics-privacy-handoff.md`에 있다. 다음 요청에서 지시한 범위만 이어 간다. 향상된 측정 변경·맞춤 측정기준 등록·양성 브라우저 검증·인덱싱/GA 활성화·PR merge·배포·다음 안정화 항목을 자동 시작하지 않는다.

### 운영 개인정보 안내 마무리 제안 — 2026-10-03 후속 요청

**결과: 사용자 답변 반영·미결정 정책의 제안안·공개 초안 갱신·로컬 검증 완료. 제안 정책 채택, 전체 처리방침 확정·출시 완료는 아님.** 앞 준비 기록에 이어 이번 후속 요청만 수행했다. GA 설정·활성화/인덱싱 변수·동의/측정 로직 변경, 데이터 삭제, 커밋·push·PR merge·stage/production 배포는 하지 않았다. 다음 항목도 시작하지 않는다.

#### 확정 답변과 제안의 구분

- 사용자 답변으로 `me@seungjun.sh` 수신·확인 가능을 반영했다. 테스트 메일 전송은 하지 않았다.
- 실제 공개일을 안내 시행일로 사용한다는 결정을 반영했다. 아직 공개하지 않았으므로 날짜는 미기입이며 오늘 날짜나 배포 승인으로 해석하지 않았다.
- 기존 basic 방식, 현재 GA 이벤트 2개월 / 사용자 14개월 / 새 활동 시 재설정 켜짐, localStorage 자동 만료 없음, 해외 방문 가능을 유지했다.
- 사용자는 답변 목표·기록 보관·별도 저장을 정하기 어렵다고 하여 **제안안을 요청**했다. 아래는 아직 채택 전이며 확정된 운영 약속·법정 기한으로 기록하지 않는다.

| 항목           | 제안                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 첫 답변        | 접수 후 3영업일 이내 접수 확인·추가 정보 안내 목표. 모든 삭제/열람 완료 기한 아님.                                                                                                      |
| 요청 절차      | 메일 접수 → 최소 정보로 대상 브라우저 식별 가능 여부·요청 범위 확인 → 가능한 조치와 제한 사유·후속 일정 안내. 신분증/인증 정보 일괄 요구나 식별용 새 수집·재동의 요청은 하지 않음.      |
| 요청 메일·기록 | 종료 후 최대 90일 후속 문의 대응용 최소 기록 보관 뒤 삭제. 불필요한 첨부 먼저 삭제. 월 1회 확인하면서 다음 확인일까지 기한 도달할 기록은 미리 삭제. 법정 의무 기간이라고 설명하지 않음. |
| 별도 GA 저장   | 별도 CSV·BigQuery·자체 DB 내보내기/백업을 시작하지 않고 GA 보고서에서 확인. 기존 수동 사본 여부는 미확인.                                                                               |
| 집계 보고서    | 분석 운영 기간 GA에서 이용. 분석 종료 또는 사이트 폐쇄 시 해당 GA 속성 삭제 절차를 진행하는 제안. 실제 삭제 방법/Google 처리 기간은 당시 확인하며 실행은 별도 승인 범위.                |

수동 운영 방법·채택 후 사용할 공개 문안은 `docs/analytics-privacy-operations-proposal.md`에 작성했다. `src/pages/privacy.astro`에는 **‘운영 제안 · 승인 전’**으로 두 곳에 표시하고 문의 주소·실제 공개일 시행 기준을 반영했다. 하단·동의 패널의 기존 안내 연결은 유지했다.

#### 추가 읽기 확인과 지침 접근 회복

- 실제 운영 GA 속성 `557066996`의 BigQuery 연결과 Google Ads 연결 화면을 읽었다. 연결 항목 없음 표시를 확인했으며 생성·저장·삭제는 하지 않았다. 속성의 광고 개인화 허용 지역은 307/307이며 사이트 코드의 광고 제한과 구분한다. 계정 전체 외부 저장 부재나 과거 수동 다운로드 부재를 뜻하지 않는다.
- [Google 사용자 탐색](https://support.google.com/analytics/answer/9283607?hl=en)의 웹 client ID·조회/삭제 권한·삭제 처리 설명과 [데이터 보관](https://support.google.com/analytics/answer/7667196?hl=ko)의 표준 집계 보고서 제외 범위를 읽었다. 이메일만으로 모든 GA 데이터를 식별·삭제하거나 첫 답변 목표 안에 Google 삭제가 끝난다고 보장하지 않았다. 실제 사용자 식별·삭제는 실행하지 않았다.
- 앞 기록의 PIPC 첨부 접근 실패는 이번에 **국립세종도서관 공식 보관본으로 회복**했다. [2026.4 개정 지침 보관 페이지](https://policy.nl.go.kr/search/searchDetail.do?rec_key=SH2_PLC20260371507)와 원 발행처를 확인하고 페이지의 다운로드 경로로 185쪽 PDF를 받았다. 다운로드 URL: `https://policy.nl.go.kr/cmmn/FileDown.do?atchFileId=371507&fileSn=199735`; 로컬 증거 `/tmp/devlog-privacy-guideline-2026.pdf`.
- PDF 관련 부분을 실제 읽음: 보관 기준·기간(인쇄 31~~32 / PDF 33~~34), 파기(인쇄 35 / PDF 37), 국외 이전(인쇄 45 / PDF 47), 권리 행사·담당 창구(인쇄 65~~66 / PDF 67~~68). PDF 68쪽은 렌더링 이미지도 확인했다. 전체 185쪽이나 적용 법률 전체를 검토했다고 주장하지 않는다. 앞 절의 ‘PDF 본문 미열람’은 당시 상태이며 이 후속 기록으로 해당 한계를 갱신한다.
- 구체적 보관 기간/기준·불필요 정보 파기·실제 권리 행사 창구를 제안과 대조했다. 지침의 다른 업종 예시 기간이나 권리 행사 예시 기한을 이 블로그에 적용되는 법적 의무로 복사하지 않았다. 국외 이전 고지·계약·법률 준수는 여전히 미확정이다.

#### 이번 변경의 로컬 검증

- `pnpm check`: **86 files, errors 0, warnings 0, hints 6**.
- 기본 `pnpm build`: **327 pages**, 성공. 기존 CSS 최적화 경고 5개는 남아 있다. 활성화 변수를 변경하거나 활성 조합 빌드를 새로 수행하지 않았다.
- `GA4_EXPECTED_TARGET=disabled node scripts/verify-analytics.mjs`: **327 built pages / enabled 0**, 기존 모의 consent/event guards 통과. 실제 GA 수신 증거 아님.
- 산출물 단언: privacy/home/D1 template 각각 안내 링크 2개·활성 GA ID 없음. privacy noindex/nofollow, 문의 mailto, 3영업일·90일·실제 공개일 기준·승인 전 표시 확인.
- 기존 로컬 preview를 새로고침해 문안이 표시되는 것을 브라우저에서 읽었다. privacy DOM에서 **robots noindex,nofollow / activeId null / Google 외부 script 0 / 제안 블록 2 / 동의 패널 hidden / me@seungjun.sh 링크** 확인. 새 Google Network/DebugView/철회·쿠키 양성 검증은 하지 않았다.
- 변경 페이지·제안 문서·인계 문서·새 결과 절의 Prettier 검사와 `git diff --check` 통과. 기본 폴더 기존 tracked diff의 전후 binary diff를 `cmp`로 대조해 동일함을 확인했다. 계획 문서는 각 폴더 기존 내용 뒤에 이 절만 추가하고 이전 내용이 동일한 prefix임을 확인했다. 이번 로컬 작업의 원격 CI는 실행하지 않았다.

#### 남은 사항과 종료

- [x] 사용자 확정 답변과 미결정 항목의 구체적 제안을 안내 초안·운영 문서·인계에 반영.
- [x] 관련 공식 지침 PDF 접근 회복 및 해당 부분 대조, 로컬 무수집/링크/문안 검증.
- [ ] 운영 제안 채택, 기존 수동 저장 여부 확인. 아직 제안을 확정 약속으로 바꾸지 않음.
- [ ] 실제 요청 식별·삭제 실행 가능성/권한, 적용 법적 기한·예외, 이메일 삭제·백업 정책 확인.
- [ ] Google 실제 계약·국외 이전 고지/해외 적용 범위, 향상된 측정의 실제 수집 범위·쿠키 만료/철회, 서버·보안 로그 등 전체 사이트 처리 범위 확인.
- [ ] 정책 확정 뒤 최종 문안과 실제 공개일 기입. 전체 정책 확정·운영 출시 완료는 미완료로 유지.

`docs/analytics-privacy-handoff.md`를 갱신했다. 여기서 멈춘다. GA 설정·맞춤 측정기준·활성화 변수·양성 GA 검증·merge·배포·다음 안정화 항목은 별도 요청 없이 시작하지 않는다.

### 운영 개인정보 안내 정책 채택과 추가 확인 — 2026-10-03

사용자가 **“제안 채택할게 다음것들 진행해”**라고 답했다. 이를 운영 개인정보 안내의 제안 정책 채택과 남은 준비 작업 지시로 반영했다. 기존 금지 범위는 유지하며 GA 설정·활성화/인덱싱 변수·merge·배포·다음 체크리스트의 승인으로 해석하지 않았다. 앞 절의 ‘운영 제안 미채택’ 상태는 이 기록으로 갱신한다.

#### 채택·반영한 내용

- 첫 답변은 접수 후 **3영업일 이내** 목표다. 접수 확인·필요 정보 안내이며 모든 삭제 완료 기한이 아니다.
- 이메일로 요청 범위와 대상 브라우저 데이터의 안전한 식별 가능 여부를 확인하고, 가능한 조치·제한 사유·후속 일정과 결과를 안내한다. 불필요한 신분증/인증 토큰/전체 쿠키 요구와 식별을 위한 새 수집·재동의는 하지 않는다.
- 최소 요청 메일·기록을 처리 종료 후 **최대 90일** 후속 문의 대응용으로 보관 후 삭제한다. 불필요한 첨부는 먼저 삭제한다. 월 1회 확인해 다음 확인일까지 기한에 도달할 자료를 미리 삭제한다. 법정 의무 보관 기간으로 설명하지 않는다.
- 새 GA CSV·BigQuery·자체 DB 저장 운영을 시작하지 않는다. 집계 보고서는 분석 운영 기간에 이용하고 분석 종료/사이트 폐쇄 시 속성 삭제 절차를 진행한다. 과거 사본 부재를 단정하지 않으며 삭제 실행은 별도 지시가 필요하다.
- 기존 basic 방식, `me@seungjun.sh`, GA 이벤트 2개월/사용자 14개월/새 활동 시 사용자 재설정 켜짐, localStorage 자동 만료 없음, 해외 방문 가능, 실제 공개일 시행 기준을 유지했다. 이미 채택된 항목은 다시 묻지 않았다.

#### 직접 확인한 현재 상태와 설정

- 구현 `codex/ga4-completion` HEAD `e8a22d38c093514d34fb1b3489db1a0a1a562dc7`, 관련 [PR #34](https://github.com/whateveriiwant/devlog/pull/34)는 OPEN/draft이고 같은 head였다. 작업 시작 때 계획 문서·동의 UI 변경과 개인정보 페이지·운영 문서·인계 문서의 미추적 변경이 있었다. 그대로 보존하며 필요한 문안만 추가했다. 커밋·push·merge하지 않아 원격 PR에는 개인정보 작업이 아직 없다.
- 운영 GA 속성 액세스 관리: 정승준 1행, 관리자 역할. 실제 방문자 조회·삭제는 하지 않았다. 역할 확인이 실제 요청의 식별·삭제 완료 증거는 아니다.
- GA 계정 공유 **4항목 모두 체크**: Google 제품 및 서비스, 참여 모델링 및 비즈니스 통계, 기술 지원, 비즈니스를 위한 추천. 이는 태그 코드의 광고 관련 denied/false와 별개다. 공개 안내와 동의 패널에 목적·공유 범위를 추가했으며 설정을 바꾸지 않았다.
- 계정 화면에 데이터 처리 약관과 컨트롤러 간 데이터 보호 약관 수락일 **2026-10-02** 표시. 약관 관리에는 연결된 조직 없음, 법인 이름의 실제 값 미표시, 연락처 0행. 기존 ‘수락 여부 미확인’은 좁혔지만 계정별 계약 버전·상대방·국외 처리 조건은 미확정이다. 약관 수락·연락처 입력·조직 연결은 하지 않았다.
- Google 태그의 **기본 쿠키 설정 재정의 꺼짐**, 저장 버튼 비활성. 실제 생성 쿠키의 만료·갱신·철회는 별도 검증 필요다.
- 향상된 측정은 로딩 완료 후 활성으로 읽었다. 페이지 조회·스크롤·이탈 클릭과 추가 4개, 이메일 데이터 수정 활성/URL 쿼리 키 수정 비활성이다. 로딩 중 임시 0 표시를 설정값으로 기록하지 않았다. 현재 자동 이벤트의 실제 수집 범위는 미확정으로 유지한다.
- 실제 production Cloudflare `devlog` / `devlog-cms` 각각 Workers Logs·Workers Traces **Disabled**. 전체 Cloudflare 접속·보안 정보 미처리/보관 기간의 증거로 일반화하지 않았다. Logpush 화면에는 구독 안내만 있어 전체 작업 목록은 확인하지 못했다.
- 코드에서 관리자 세션 해시·GitHub 로그인·생성/만료 시각의 D1 저장, 12시간 유효성 검사, 다음 로그인 시 만료 행 정리와 로그아웃 시 해당 행 삭제, OAuth 쿠키 600초를 읽었다. 12시간 자동 물리 삭제가 아니다. 기존 전체 D1 백업은 세션 행도 포함할 수 있지만 실제 운영 실행·접근·보관은 미확인이다. 인증/백업 코드는 바꾸지 않았다. 요청 메일 90일 정책을 D1/백업에 적용하지 않았다.
- 공개 MX 조회는 `mx01.mail.icloud.com`, `mx02.mail.icloud.com`. 최종 메일 저장·전달·삭제/백업 정책이나 테스트 메일 수신의 증거는 아니다.

#### 공식 자료와 적용 한계

- [Google 데이터 공유](https://support.google.com/analytics/answer/1011397?hl=ko), [현재 한국어 표준 이용약관](https://marketingplatform.google.com/about/analytics/terms/kr/), [데이터 처리 약관](https://business.safety.google/adsprocessorterms/)의 관련 부분을 읽었다. 공개 표준 약관은 Google LLC이나 실제 계정별 계약 전체를 확정하지 않았다. 제품·서비스 공유의 컨트롤러 약관 설명을 반영했으며 전부 단순 수탁으로 설명하지 않는다.
- Google의 파트너 정보 사용 페이지는 web 도구에서 접근 오류가 났지만 브라우저에서 [실제 도착 페이지](https://policies.google.com/technologies/partner-sites?hl=ko)를 열어 확인했다. 공개 초안에 해당 링크를 추가했다.
- [Cloudflare 개인정보 처리 설명](https://www.cloudflare.com/privacypolicy/)의 IP·트래픽 처리와 [Workers Logs 문서](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)를 대조했다. 일반 로그 기간을 이 사이트 전체 보관 기간으로 임의 확정하지 않았다.
- [개인정보 보호법 시행령](https://www.law.go.kr/법령/개인정보보호법시행령)의 브라우저 원문, **2026-09-11 시행/대통령령 제36671호**에서 제41·42·43·44조 관련 부분을 읽었다. 열람·정정/삭제·처리정지와 연기/거절에 관한 수령 후 **10일 이내 조치·통지** 규정을 운영 절차에 별도 기록했다. 개인 블로그에 대한 법률 적용·예외 전체 검토 완료를 뜻하지 않는다. 첫 답변 목표와 법적 기한, Google 서버 실제 삭제 완료를 구분한다.

#### 변경한 준비물과 검증 증거

- `src/pages/privacy.astro`: 채택 정책의 승인 전 표시 제거, 시행일 미기입/출시 전 초안 유지. Google 공유 목적, 기본 쿠키 재정의 확인, Cloudflare 사이트 제공·보안 처리 및 미확인 범위를 추가했다. `AnalyticsConsent.astro`에 Google 공유 목적 요약을 추가했다. 선택 버튼·저장·철회·GA 초기화 로직은 바꾸지 않았다.
- `docs/analytics-privacy-operations-proposal.md`: 파일명을 유지하고 내용은 채택 정책으로 갱신했다. 수동 처리 절차, 기한 구분, 최소 기록/삭제 방법, 접수·결과 답장 틀과 남은 확인을 정리했다. 실제 요청 정보·인증 정보는 넣지 않았다. `docs/analytics-privacy-handoff.md`에서 이미 채택된 항목을 다시 묻지 않도록 갱신했다. 두 운영 문서는 기본 폴더와 구현 트리에서 동일하며 동기화 직전 기본 폴더 내용이 기존 스냅샷과 같음을 확인했다.
- `pnpm check`: **86 files, errors 0, warnings 0, hints 6**.
- 기본 `pnpm build`: **327 pages**, 성공. 기존 CSS 최적화 경고 5개 유지. 빌드 기록 `/tmp/devlog-privacy-adoption-build.log`. 활성화 변수를 바꾸거나 새 활성 조합 빌드를 수행하지 않았다.
- `GA4_EXPECTED_TARGET=disabled node scripts/verify-analytics.mjs`: **327 built pages / enabled 0 / mocked event guards PASS**. 실제 GA 수신·삭제 증거가 아니다.
- HTML 단언: privacy/home/article-template 안내 링크 각 2개, 활성 GA ID 없음, Google 공유 목적 요약 있음. privacy에는 noindex/nofollow, me@ 이메일, 3영업일·90일·실제 공개일 기준·채택 표시·Cloudflare·미확인 표시가 있고 ‘승인 전’은 없음.
- 기존 로컬 preview `/privacy/`를 새로고침해 표시 문안을 읽었다. DOM **robots noindex,nofollow / activeId null / Google 외부 script 0 / adopted true / approvalPending false / Cloudflare와 공유 설명 있음**. Network/DebugView 양성 수신·실제 Google 쿠키 철회 검증은 하지 않았다.
- 기본 폴더 기존 tracked binary diff의 전후 `cmp` 동일. 계획 문서는 각 폴더 기존 내용을 동일한 prefix로 보존하고 이 절만 추가했다. 변경 파일 Prettier와 `git diff --check` 확인. 원격 CI·배포는 하지 않았다.

#### 남은 확인과 종료

- [x] 운영 제안 채택 반영, 공개 경로 초안·동의 UI 연결·실행 문서와 인계 갱신, 로컬 무수집 검증.
- [x] 권한·계정 공유/약관 수락·기본 쿠키 override·운영 Worker 관측 설정을 읽기 확인하고 확인 범위를 기록.
- [ ] 한 번에 질문한 사용자 사실 2개 답변 대기: 과거 GA CSV·시트·스크린샷 등 별도 저장 여부/위치, me@의 실제 메일 수신·저장/전달 서비스. MX나 연결 목록으로 대신 단정하지 않음.
- [ ] 이메일 서비스 삭제/백업 조건, 안전한 실제 요청 식별·조치 방법과 적용 법률·기한·예외.
- [ ] 계정별 Google 계약·공유·국외 처리 고지, Cloudflare/사이트 백업의 실제 처리·보관 범위, 자동 측정·쿠키의 실제 결과.
- [ ] 최종 문안·실제 공개일 기입과 공개. **전체 정책 확정·법률 준수·출시 완료는 기록하지 않음.**

이 작업은 여기서 멈춘다. 다음 대화용 프롬프트는 `docs/analytics-privacy-handoff.md`에 있다. GA 설정·활성화/인덱싱 변수·실제 개인정보 삭제·merge·stage/production 배포·다음 안정화 항목을 자동 시작하지 않는다.

### 개인정보 안내 사용자 사실 확인 반영 — 2026-10-03

사용자 답변: **“GA 자료 따로 저장한적 없어 문의 이메일은 아이클라우드 이메일로 받고있어”**. 개인정보 안내 준비의 연속 작업으로 두 답변만 반영하고 관련 메일 삭제 안내를 확인했다. 앞 절의 사용자 사실 2개 답변 대기를 이 기록으로 해소한다.

- [x] 과거 별도 GA 저장 자료 없음: **사용자 제공 사실**로 기록. 계정·기기 전체를 감사한 결과로 설명하지 않는다. 공개 초안은 GA 보고서에서 이용하고 별도 자료로 내보내 보관하지 않는 문안으로 정리했다. 기존 사본 미확인 문장은 제거했다.
- [x] 문의 수신 서비스 iCloud Mail: **사용자 제공 사실**로 기록. 공개 안내에 Apple iCloud Mail과 답장 주소·요청 내용·필요한 최소 기록의 이용 목적을 추가했다. 메일함 내용을 열거나 테스트 메일을 보내지 않았다. 별도 전달·동기화·사본 부재를 답변에서 추정하지 않는다.
- [Apple 공식 iCloud Mail 삭제 안내](https://support.apple.com/en-au/guide/icloud/mm6b1a7ab7/icloud)의 관련 부분을 열어 읽었다. 일반 삭제는 휴지통 이동, 휴지통 최대 30일, 휴지통 비우기는 복구할 수 없는 영구 삭제로 안내한다. 앱 설정에 따라 더 빨리 삭제될 수 있다. **채택한 종료 후 90일 기한은 휴지통 보관까지 포함**해 관리하도록 공개 문안과 수동 운영 절차를 구체화했다. 실제 메일 삭제·iCloud 설정 변경은 하지 않았다. 다른 메일까지 휴지통 전체 비우기로 일괄 삭제하지 않도록 운영 문서에 남겼다.
- [ ] iCloud 실제 계정의 전달·동기화·별도 사본, Apple 내부 백업·법적 보관 및 계약·국외 처리 조건은 미확인이다. 공식 메일함 삭제 설명만으로 모든 서버 사본의 즉시 삭제를 보장하지 않는다.
- 공개 초안 `src/pages/privacy.astro`, 운영 문서 `docs/analytics-privacy-operations-proposal.md`, 인계 `docs/analytics-privacy-handoff.md`에 반영했다. 인계에서 이미 답변한 두 사실을 다시 묻지 않도록 수정했다. 기존 동의 UI 연결과 동의/GA 동작 로직은 그대로다.

검증 증거:

- 작업 시작 시 구현 HEAD `e8a22d38c093514d34fb1b3489db1a0a1a562dc7`, [PR #34](https://github.com/whateveriiwant/devlog/pull/34) OPEN/draft, 동일 head 확인. 기존 미커밋 변경을 보존했다.
- 기본 `pnpm build`: **327 pages 성공**, 기존 CSS 최적화 경고 5개 유지. 기록 `/tmp/devlog-privacy-mail-build.log`.
- `GA4_EXPECTED_TARGET=disabled node scripts/verify-analytics.mjs`: **327 built pages, 0 enabled pages, mocked event guards PASS**. 실제 Google 수신·쿠키·삭제 증거는 아니다.
- 산출물/문서 단언: iCloud Mail·별도 GA 보관 안 함·90일과 휴지통·me@ 창구·미확인 표시·실제 공개일 기준 반영, privacy noindex/nofollow·활성 분석 ID 없음·Google 외부 script 태그 없음·안내 링크 2개. 운영 문서와 인계의 두 사실 답변 대기 제거 확인.
- 페이지/운영 문서/인계/새 결과 절 Prettier 검사와 `git diff --check` 통과. 기본 폴더의 기존 tracked diff는 시작 스냅샷과 동일하며, 두 계획 문서는 기존 내용을 동일한 prefix로 보존해 이 절만 추가했다. 운영/인계 문서는 동기화 전 기본 폴더 내용 일치 여부를 확인하고 갱신했다.

사용자 결정·사실 답변은 현재까지 반영 완료다. Google/Cloudflare/Apple의 계정별 계약·국외 처리·실제 보관 조건, 권리 행사 적용 범위와 실행 방법, 자동 측정/쿠키 실제 검증은 출시 전 확인 사항으로 유지한다. **전체 처리방침 확정·법률 준수·출시 완료는 아니다.** GA 설정·활성화/인덱싱 변수·실제 데이터 삭제·커밋/push·merge·stage/production 배포는 하지 않았다. 인계를 갱신하고 여기서 멈추며 다음 항목은 자동 시작하지 않는다.

### 운영 개인정보 안내 출시 전 사실 확인·문안 정리 — 2026-10-03

이번 범위는 공급자·관련 계정의 **읽기 확인**, 개인정보 초안과 수동 요청 운영 절차 보완, 남은 외부 사실 정리다. 실제 분석 수신·쿠키 생성/철회 검증이나 출시를 진행하지 않았다. 상세 근거·확인 한계는 `docs/analytics-privacy-operations-proposal.md`의 같은 날짜 ‘출시 전 사실 확인과 수동 절차 보완’ 절, 다음 대화 프롬프트는 `docs/analytics-privacy-handoff.md`에 있다.

#### 실제 상태와 보존

- 시작 직접 확인: 구현 브랜치 `codex/ga4-completion`, HEAD `e8a22d38c093514d34fb1b3489db1a0a1a562dc7`, [PR #34](https://github.com/whateveriiwant/devlog/pull/34) OPEN/draft·동일 head. GitHub 인증 상태와 적용되는 `/Users/seungjun/.codex/AGENTS.md`를 읽었다. PR을 대화에 연결했다. commit/push/stage/merge는 하지 않았다.
- 기존 변경: 구현 트리의 계획/동의 UI tracked 변경과 privacy/운영/인계 untracked 문서, 기본 폴더의 다른 사용자 변경을 먼저 확인했다. 스냅샷 `/tmp/devlog-privacy-facts-20261003/{base,wt}-tracked.diff`와 `{base,wt}-files.json` 보존. 두 계획은 원문 prefix를 유지해 이 절만 덧붙였다. 운영/인계는 기본 폴더 원문이 시작 스냅샷과 동일함을 확인한 뒤 구현 트리와 동기화했다. 동의 UI·분석 동작은 이번에 변경하지 않았다.

#### 사실 확인 결과와 문안 반영

- **사용자 제공:** “Spark로 보고있어 국가는 대한민국 백업은 다른 곳에 저장하거나 공유한적 없어”. 문의 확인 앱 Spark, Apple 계정 국가 대한민국, 사이트 백업의 다른 저장/공유 이력 없음으로 반영했다. 전체 계정·기기·권한 감사 결과로 확대하지 않았다. 과거 GA 별도 저장 없음/iCloud 수신 답변도 유지하며 다시 묻지 않는다. 전달 규칙·기기·로컬/다운로드 사본 질문은 답변되지 않았다.
- **GA 화면:** 계정410455528 국가 대한민국, 공유4개 체크, 처리/컨트롤러 약관 수락일2026-10-02, 약관 관리 조직 없음/실제 법인명 미표시/연락처0행, 스트림15942609257/G-RQ6456HXLD와 쿠키 override 꺼짐을 읽었다. 설정 변경은 하지 않았다. 관리자·보관2/14개월은 앞 읽기 기록과 유지 결정이며 실제 수신 증거는 아니다.
- **Google 공식 표준과 실제 적용 구분:** [한국어 표준 약관](https://marketingplatform.google.com/about/analytics/terms/kr/), [처리 약관](https://business.safety.google/adsprocessorterms/), [컨트롤러 약관](https://business.safety.google/controllerterms/)의 관련 조항을 대조했다. 공개 계약 주체·시설/하위 처리자 목록을 계정별 실제 수령자·국가·연락처·근거로 채우지 않았다. 계약상 삭제 처리 기간과 기능별 사용자 삭제 기간도 구분했다.
- **Cloudflare 실제 보관 일부 확인:** D1 devlog-content Time Travel 화면 **과거7일**, 관할None/APAC/read replicationDisabled. R2 백업4객체 약568.67MB/private/APAC, initial 객체 메타정보 확인. 완료 객체의 만료 규칙 없이 미완료 multipart7일 중단만 있었다. GitHub CONTENT_BACKUPS_ENABLED=true와 [성공 실행36388167681](https://github.com/whateveriiwant/devlog/actions/runs/36388167681)의 export/verify/encrypt/store/cleanup 성공을 읽었다. 객체 본문·실제 인증 행은 열지 않았다. CLI D1 info는 인증10000 실패 후 Dashboard로 확인했다.
- **세션/백업 구현:** 12시간은 세션 유효성이고 정기 물리 삭제가 아니다. 전체 SQL 백업에는 세션 행이 있으면 포함 가능. 성공 실행의 테이블 표에는 admin_sessions 없음이 보였으나 모든 사본의 내용까지 확정하지 않았다. 주간4/월간12 **개수** 정리는 성공 저장 후이며 initial은 정리 대상 밖. 고정4주/12개월 삭제가 아니다. 초기 사본 목적/삭제일·세션 정리·실패 시 오래된 사본 처리·접근자·복원 재유입은 변경 필요 사항으로 기록만 했다. 요청 메일90일을 적용하지 않았다. 실배포 버전 대응은 미확인이다.
- [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), [개인정보 설명](https://www.cloudflare.com/privacypolicy/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)을 대조했다. 앞 Workers Logs/TracesDisabled와 이번 R2 Data Access LogsDisabled를 전체 접속/보안 정보 부재·전체 보관 기간으로 일반화하지 않았다. 실제 계약·국외 처리·계정 전체 로그/권한은 남았다.
- **메일:** [Apple 한국 지역 약관](https://www.apple.com/legal/internet-services/icloud/kr/terms.html), [일반 삭제](https://support.apple.com/en-au/guide/icloud/mm6b1a7ab7/icloud), [전달 설명](https://support.apple.com/guide/icloud/automatically-forward-email-mm6b1a3960/icloud), [Spark 현행 개인정보 설명](https://sparkmailapp.com/legal/privacy-app)의 관련 부분을 읽었다. 공개 지역 계약 주체와 실제 수락 버전/처리 국가를 구분했다. Spark의 기능별 서버 처리·통상 백업 보관 설명을 개별 요청의 최대 삭제 보장으로 옮기지 않았다. 실제 메일 본문/암호·설정은 열거나 변경하지 않았다.
- **90일 수동 운영:** 받은/보낸/임시/보관 메일·첨부·실제 사용한 사본을 대상으로 월1회 미리 정리. 개별 영구삭제 방법이 미확인이면 iCloud 휴지통 최대30일을 고려해 종료후60일을 넘기기 전에 대상 이동을 계획하도록 구체화했다. 다른 메일이 섞인 스레드/휴지통 전체 비우기나 Spark 계정 전체 삭제를 하지 않는다. 내부 공급자 백업의 미확인 한계는 남긴다.
- **권리 행사:** [Google 사용자 탐색](https://support.google.com/analytics/answer/9283607?hl=en), [Admin API 제출 기능](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties/submitUserDeletion)과 [v3 이전 안내](https://developers.google.com/analytics/devguides/config/userdeletion/migration)를 대조했다. 이메일은clientID가 아니고 기존 식별자/정당한 본인 확인이 필요하다. 새 수집/재동의 없이 가능한 범위, 열람 제한, 제출 시각과 표시 제외24시간/그 다음63일 영구삭제 설명을 구분했다. 실제 방문자 조회/삭제/API 호출은 하지 않았다. 실제 안전한 ID 읽기/본인 확인/완료 확인 방법은 남았다.
- **법률:** [개인정보 보호법](https://www.law.go.kr/법령/개인정보보호법) 및 [시행령](https://www.law.go.kr/법령/개인정보보호법시행령) 2026-09-11 시행본의 해당 권리·국외이전 조항을 읽었다. 10일 조치/통지·예외를3영업일 초기 답장과 구분하고 정보 요청/Google대기로 자동 연장되지 않도록 기록했다. [EDPB 권리 안내](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_ga)의 GDPR기한은 조건부로 정리했다. 이 블로그의 법률 적용 전체·해외 영토 적용은 확정하지 않았다.
- 공개 `src/pages/privacy.astro`에 Spark, 관리자 세션/복구 백업의 범위와 미확정 보관, 첫 답변/제출/실제 완료 구분만 추가했다. 국외 처리의 실제 국가·수령자·연락처·기간·법적 근거를 추정하지 않았고 초안·미확인·실제 공개일 미기입 상태를 유지했다.

#### 허용된 로컬 검증 증거

- 기본 `pnpm build` 성공: **327 pages**, CSS 최적화 경고5개 및 기존 pseudo-class 경고 표시. 기록 `/tmp/devlog-privacy-facts-20261003/build.log`. 활성화/인덱싱 변수를 변경하지 않았다.
- `GA4_EXPECTED_TARGET=disabled node scripts/verify-analytics.mjs`: **327 built pages / 0 enabled pages / mocked GA4 event guards PASS**. 실제 Google 수신·쿠키·삭제의 증거가 아니다.
- HTML 단언 PASS: privacy noindex/nofollow, 활성 분석ID없음, Google외부script없음, iCloud/Spark·90일·3영업일·12시간세션·제출/완료·me@·초안/공개일과 Spark/mailto 링크 확인.
- 변경 페이지/운영/인계/새 결과 절 Prettier 검사, `git diff --check` 통과. 원문 prefix·기존 동의UI·다른 tracked diff 보존 확인. 로컬 typecheck/원격CI는 이번에 실행하지 않았으며 문안 변경의 무수집 빌드/기존 보호 검사만 했다.

#### 남은 외부 확인과 종료

- [ ] 계정별 공급자 계약 버전·처리/이전 국가·수령자/연락처·시점/방법·목적/보관/법적 근거. 공급자 정책/계정 계약 화면/지원·개인정보 문의 경로와 공개자료 한계를 운영 문서에 기록했다. 연락 발송은 하지 않았다.
- [ ] 초기백업·세션·백업실패/복원·실제접근자의 보관/삭제 기준. 필요 구현/설정은 기록만 하고 실행하지 않았다.
- [ ] 사용자 직접 확인이 필요한 미답변 사실: iCloud.com Mail 설정 → 전달/규칙의 서비스와 원본유지, 메일기기/로컬폴더/다운로드/내보내기/기기백업, Spark 공유/예약/큰첨부/AI 등 실제 사용 기능. 앱·국가·사이트외부백업 없음은 이미 답변됐다. 본문·암호는 불필요하다.
- [ ] 안전한 기존 브라우저 식별과 본인/대리인 확인·대상만 권리 조치/완료 확인, Spark 개별 영구삭제/동기화 UI. 실제 데이터 조치는 별도 범위다.
- [ ] 향상된 측정 자동 매개변수·실제 쿠키 생성/갱신/철회·Google Network/DebugView/Realtime 수신은 **미실행**. 명시적으로 승인된 분리 검증환경·색인가능 경로·동의상태·브라우저프로필이 필요하다. 이번에 시작하지 않았다.

전체 정책 확정·법률 준수·출시 준비 완료로 기록하지 않는다. 실제 데이터 삭제, GA설정/공유/약관·활성화/인덱싱 변수 변경, commit/push/merge, stage/production배포는 하지 않았다. 인계를 갱신하고 여기서 멈추며 실제 분석 검증·출시·다음 체크리스트는 자동 시작하지 않는다.

### 문의 메일 전달·Spark 사용 범위 답변 반영 — 2026-10-03

사용자 답변 **“메일 전달규칙 따로 없어 / 스파크는 송수신만 하는 정도야”**를 반영했다.

- [x] 메일 전달·규칙 없음, Spark는 송수신 정도로 사용: **사용자 제공 사실**. 앞 절의 두 항목 답변 대기를 해소한다. 설정 화면·전체 기능·기기 감사 결과로 확대하지 않으며 같은 질문을 다시 하지 않는다.
- 공개 초안 `src/pages/privacy.astro`의 해당 미확인 문장을 답변에 맞게 수정했다. 공급자 기능별 서버 처리 설명은 유지하되, Spark의 공유·예약·AI 등을 실제 사용하는 것으로 단정하지 않는다.
- 운영 문서와 다음 대화 인계를 갱신하고 기본 폴더와 동기화했다. 기존 계획 원문은 유지해 이 기록만 덧붙였다. 메일 기기·로컬 폴더·다운로드 첨부·내보내기·기기 백업, 공급자 내부 처리/백업과 앱별 개별 삭제·동기화는 여전히 미확인이다. 이번에 추가 질문을 반복하지 않았다.
- 검증: 변경 파일과 추가 결과 절 Prettier 검사, 두 폴더 `git diff --check`, 문안·인계 단언 및 계획 prefix/동의 UI/기타 tracked 변경 보존 검사 통과. 공개 페이지는 해당 문단만 변경했고 noindex·동의/분석 로직은 유지했다. 문안만 변경해 빌드·실제 브라우저/메일 검증을 반복하지 않았다. 앞 절의 327페이지 무수집 빌드는 이전 검증 증거이며 이번 변경을 포함한 새 빌드 결과가 아니다.

HEAD `e8a22d38c093514d34fb1b3489db1a0a1a562dc7` 유지. 실제 메일·방문자 조회/삭제, 공급자 설정 변경, commit/push/merge/배포는 하지 않았다. 출시 전 초안과 미확인 표시·시행일 미기입을 유지하며 다음 검증·출시는 자동 시작하지 않는다.
### 운영 GA 설정 최종 조정안과 격리 검증 준비 — 2026-10-05

**준비 완료 / 실행 미완료.** 이번에는 운영 GA 화면과 현재 로컬 구현을 읽고 설정 제안·등록안·격리 환경 설계·실제 검증 양식을 작성했다. 설정 변경, 맞춤 정의 등록, 필터 생성/변경, Google 양성 수신/쿠키 검증, 환경 생성, 배포, commit/push/merge는 실행하지 않았다. 아래 제안은 채택되거나 적용된 값이 아니다.

#### 직접 확인 증거와 보존

- 구현 트리 `/Users/seungjun/.codex/worktrees/ga4-completion/devlog`, 브랜치 `codex/ga4-completion`, HEAD `e8a22d38c093514d34fb1b3489db1a0a1a562dc7`. `git status --short`, `rev-parse HEAD`, `branch --show-current`와 `gh pr view 34 --repo whateveriiwant/devlog --json state,isDraft,headRefName,headRefOid,statusCheckRollup,url`로 확인했다.
- [PR #34](https://github.com/whateveriiwant/devlog/pull/34)는 OPEN/draft, 동일 head. 기존 [build CI 37096363115](https://github.com/whateveriiwant/devlog/actions/runs/37096363115/job/111127009209)는 SUCCESS. 미커밋 개인정보 작업이나 이번 문서를 검증한 원격 CI가 아니다. PR을 이 대화에 연결했다.
- 시작 변경: 구현 트리의 계획·AnalyticsConsent tracked 변경, privacy 페이지·운영 문서·인계 untracked 변경. 기본 폴더는 `codex/github-actions-deploy`이며 편집기·CSS·레이아웃·작성 결정 등 다른 변경이 있다. `/tmp/devlog-ga4-preparation-20261005`에 두 폴더의 tracked binary diff, 변경 파일 SHA-256 목록, 두 계획·기존 인계 원문을 저장했다. 이번 허용 변경은 두 계획과 두 인계의 **끝에 추가**하는 기록뿐이다.
- 적용 `/Users/seungjun/.codex/AGENTS.md`와 사용자 지시, 두 계획의 13절/마지막 기록, 구현 트리 개인정보 운영 문서·인계를 읽었다. 상위 경로 및 관련 하위 docs/src/worker/scripts/.github에서 추가 AGENTS.md가 발견되지 않았다. 큰 출력은 일부 잘렸으므로 필요한 구간을 나눠 읽었다. 운영 문서의 과거 조사 기록은 이번 재검증 결과와 구분한다.
- 로컬 근거: `src/layouts/BaseLayout.astro`, `src/pages/article-template.astro`, `src/scripts/analytics.ts`, `src/scripts/ui.ts`, `src/components/AnalyticsConsent.astro`, `src/components/SiteControls.tsx`, `src/lib/search.ts`, `src/pages/privacy.astro`, `worker/site.mjs`의 article/라우팅/관리 CSP, `worker/cms.mjs` 렌더링 스키마, `wrangler.jsonc`, `astro.config.mjs`, `src/pages/robots.txt.ts`, CI, 기존 분석 검증 스크립트. 사이트 기능 판단은 이 코드 범위다. 현재 운영 D1 콘텐츠 전체/배포 파일/방문자 활동은 조회하지 않았다.

운영 GA Chrome 관리 화면을 실제 열어 로딩 완료 값을 읽었다. 체크박스·스위치·입력값·선택값·저장 버튼을 조작하지 않았다. 읽기 목적의 메뉴 이동/상세 패널 열기/닫기만 수행했다.

| 항목                       | 2026-10-05 직접 확인                                                                                                           | 확인 경로/한계                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 운영 연결                  | 계정 410455528 / 속성 557066996, devlog-product, 스트림 15942609257, G-RQ6456HXLD, https://seungjun.sh                         | [스트림 상세](https://analytics.google.com/analytics/web/#/a410455528p557066996/admin/streams/table/15942609257). 최근 48시간 수신 없음 표시; 실제 수신 검사 아님 |
| 향상된 측정                | 전체 켜짐, 페이지 로드 켜짐(비활성 컨트롤), 브라우저 기록 기반 조회 켜짐, 스크롤/이탈 클릭/검색/양식/동영상/다운로드 각각 켜짐 | 향상된 측정 구성 및 페이지 조회 고급 설정의 Value 1                                                                                                               |
| 데이터 수정                | 이메일 활성 / URL 쿼리 키 비활성                                                                                               | 스트림 상세 표시. 실제 자동 이벤트 payload는 미확인                                                                                                               |
| 맞춤 측정기준              | 0개, 만들기 버튼 표시                                                                                                          | [맞춤 정의](https://analytics.google.com/analytics/web/#/a410455528p557066996/admin/customdefinitions/hub); 검색 필터 미입력, 로딩 완료 목록                      |
| 권한                       | 운영자 정승준 1행, 관리자                                                                                                      | [속성 액세스 관리](https://analytics.google.com/analytics/web/#/a410455528p557066996/admin/suiteusermanagement/property). 비공개 계정 이메일 기록 안 함           |
| 데이터 필터                | Internal Traffic / 내부 트래픽 / 제외 / Testing, traffic_type 정확히 internal                                                  | [데이터 필터](https://analytics.google.com/analytics/web/#/a410455528p557066996/admin/datapolicies/datafilters) 목록/상세. 개발자 필터 행 없음                    |
| IP 기반 내부 트래픽 정의   | 0개, ‘아직 규칙이 없습니다’                                                                                                    | 스트림 → 태그 설정 구성 → 자세히 보기 → 내부 트래픽 정의. 개인 IP 조회/입력 안 함                                                                                 |
| 보관                       | 이벤트 2개월 / 사용자 14개월 / 새 활동 재설정 켜짐                                                                             | [데이터 보관](https://analytics.google.com/analytics/web/#/a410455528p557066996/admin/datapolicies/dataretention). 로딩 중 빈 값/임시 0을 결과로 사용하지 않음    |
| Signals/사용자 제공 데이터 | 각각 사용 설정/사용 버튼 표시, 미활성 상태                                                                                     | [데이터 수집](https://analytics.google.com/analytics/web/#/a410455528p557066996/admin/datapolicies/datacollection). 사용 버튼 안 누름                             |
| 위치·광고                  | 세부 위치/기기 켜짐, 광고 개인 최적화 허용 307/307 지역                                                                        | 광고 고급 패널 표시. 광고 연결 목록은 이번 재확인 안 함                                                                                                           |
| 계정 공유·약관             | 공유 4개 모두 체크, 처리/컨트롤러 약관 수락일 2026-10-02 표시                                                                  | [계정 정보](https://analytics.google.com/analytics/web/#/a410455528p557066996/admin/account/settings). 계정별 계약 버전·국외 처리 고지 확정 아님                  |
| 쿠키 override              | 이번 재확인 안 함; 2026-10-03 기록은 꺼짐                                                                                      | 실제 생성·만료·갱신·철회는 계속 미검증                                                                                                                            |

보관 유지·basic 동의·localStorage 자동 만료 없음 등 확정 결정은 유지한다. 계정 공유, 광고/Signals, 보관은 향상된 측정과 **별도 설정**이다. 코드의 광고 denied, `allow_google_signals=false`, `allow_ad_personalization_signals=false`만으로 계정 공유나 속성 허용 지역도 꺼졌다고 설명하지 않는다. 이번에 이 값들을 변경할 제안을 채택하거나 실행하지 않는다.

#### 향상된 측정 조정 제안

공식 근거: [향상된 측정의 이벤트/매개변수](https://support.google.com/analytics/answer/9216061?hl=en), [page_view 기본 동작과 히스토리 설정](https://developers.google.com/analytics/devguides/collection/ga4/views), [데이터 수정의 범위와 한계](https://support.google.com/analytics/answer/13544947?hl=en). 아래 목적·제안·위험 판단은 로컬 기능과 대조한 이번 분석이며 실제 payload 결과가 아니다.

| 항목                         | 현재 | 목적 / 중복·민감 값 위험                                                  | 제안 값과 이유                                                                                                                                                                                                    |
| ---------------------------- | ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 페이지 로드 page_view        | 켜짐 | 글 조회. 다른 config/수동 조회 추가 시 중복 가능                          | 유지 제안. 현재 config 1회 기본 조회를 사용하고 수동 page_view 없음                                                                                                                                               |
| 브라우저 기록 기반 page_view | 켜짐 | 같은 문서의 기록 변경 측정; 글 조회 계약과 다른 조회가 추가될 가능성      | 끔 제안 유지. 현재 MPA 링크 이동/검색 location.assign이며 SPA 라우터 또는 자체 history 호출을 검색에서 찾지 못함. BFCache/popstate와 태그 실행 후 URL 변경은 실제 검증 필요                                       |
| 기본 scroll                  | 켜짐 | 페이지 전체 90%와 본문 25/50/75/90%를 혼동할 위험                         | 끔 제안 유지. article_progress의 본문 기준 분석으로 목적 충족; 이벤트명이 다른 것을 같은 이벤트 중복이라고 표현하지 않음                                                                                          |
| 사이트 검색                  | 켜짐 | 검색어 수집 위험. 검색 UI는 API 호출이며 페이지 query를 변경하지 않음     | 현재 기능에서는 끔 제안. URL 검색 자동 측정은 검색 모달 사용량을 설명하지 못함; 검색어 분석/새 이벤트 요구는 이번 범위에 없음                                                                                     |
| 양식 상호작용                | 켜짐 | form 메타정보/목적지 수집 위험                                            | 현재 기능에서는 끔 제안. 읽은 공개 글 UI에서 문의/신청 form 기능을 찾지 못함. 검색 입력·동의 버튼을 전환 폼으로 해석하지 않음. D1 전체 실제 DOM은 미감사                                                          |
| 외부 링크                    | 켜짐 | 본문 참고 링크의 이용 목적 가능; link_url의 민감 query/hash/경로 위험     | **조건부 유지 후보**. 외부 참고 자료 이용이 필요한지 사용자 선택 필요. 자동 옵션은 안전 링크별 allowlist가 아니므로 실제 URL/payload 확인과 안내 반영을 통과하지 못하면 끔. 자체 article_navigation과 목적이 다름 |
| 동영상                       | 켜짐 | 지원되는 플레이어의 참여 분석; 영상 제목/URL 위험                         | 현재 코드 범위에서는 끔 제안. 지원 YouTube embed 기능을 확인하지 못함. D1 전체 동영상 부재를 확정하지 않음; 이후 실제 지원 embed/분석 목적이 확인되면 재검토                                                      |
| 다운로드                     | 켜짐 | 파일 이용 목적 가능; URL/파일명/link_text 위험, 실제 완료 다운로드와 다름 | 현재 코드 범위에서는 끔 제안. 독립 다운로드 기능/측정 목적을 확인하지 못함. 본문에 향후 파일 링크가 있으면 자동 발생할 수 있으므로 필요성과 민감 값 대조 후 재검토                                                |

개별 검토 결과이며 5개 항목의 일괄 비활성화를 확정한 것이 아니다. 외부 링크·다운로드·동영상이 필요해지면 수집 목적/대상과 개인정보 안내를 함께 갱신한다. `privacy.astro`의 현재 자동 측정 ‘출시 전 확인 필요’ 문구는 그대로 유지했다. 제안만으로 이미 꺼졌다고 공개 문안을 바꾸지 않는다.

이메일 수정은 best-effort이고 URL 키 수정은 지정 키 대상이다. 자동 링크/영상/폼 URL의 정리와 모든 입력값·토큰 제거를 보장하지 않는다. 향후 자동 측정 유지 시 발견한 민감 query 키의 수정안을 별도 제시하되, 키 목록만으로 임의의 경로/hash/본문을 안전하게 만든다고 설명하지 않는다. 이번에 데이터 수정 설정도 바꾸지 않았다.

#### page_view 범위와 중복 조건

- 현재 BaseLayout은 공통 분석 번들을 넣지만 활성 ID는 indexable `/blog/<slug>/`와 postId가 있는 글에만 붙인다. 홈/목록/프로필 등 **사이트 전체 기본 조회는 현재 수집 범위가 아니다**. 공통 번들 존재와 태그 실행은 다르다. 동의 저장이 있어도 ID/경로 조건을 통과하지 못하면 config 없음.
- D1 GET `/blog/*`는 Worker가 CMS 공개 응답을 가져와 `/article-template/` 하나를 합성한다. 템플릿은 내부 404이며 비활성 template 속성을 Worker가 성공 글 응답에서만 활성 속성으로 바꾼다. 정적 ArticleLayout과 런타임 템플릿이 한 요청에서 각각 태그를 실행하는 흐름이 아니다. CMS 404/오류는 글 태그 없는 404/503 응답이다.
- 클라이언트 `analyticsStarted`가 같은 모듈/문서의 반복 허용·pageshow에서 config 재호출을 막는다. Google 공식 문서의 config 기본 `send_page_view=true`를 사용한다. **페이지 로드 옵션과 config가 켜져 있다는 사실 자체를 2회 조회라고 단정하지 않는다**.
- 중복 가능 조건: 추가 전역 태그/GTM/두 번째 번들이 별도로 config를 실행; config 기본 조회와 수동 page_view 동시 전송; 향상된 기록 옵션 켜진 상태에서 history 이벤트 발생; SPA 전환 도입 뒤 수동/자동 조회 병행. 현재 소스 검색에서는 별도 태그/수동 page_view/ClientRouter/history 호출을 찾지 못했으나 운영 실배포 및 Google 태그의 모든 원격 동작을 감사한 것은 아니다.
- BFCache 목표는 동일 문서 복원에서 새 config/같은 progress 구간 재전송 없음이다. 새 문서/새 탭/새로고침이면 새 생명주기 조회 1회가 가능하다. 히스토리 기반 조회를 끄는 제안은 BFCache를 새로운 조회로 셀지에 대한 별도 설계까지 구현한 것이 아니다.
- 처음부터 query 또는 production hash가 있는 URL은 현재 초기화 자체를 차단한다. 이미 허용 후 목차/hash 이동하는 경우와 초기 URL 제외를 구분해야 한다. 허용 전에 hash가 바뀌면 허용해도 시작하지 않을 수 있다. stage의 `#ga_debug`는 각 새 문서에 필요하고 기존 이전/다음 링크에는 붙어 있지 않아, 현재 형태에서 목적지 양성 조회가 자동 이어진다고 보장할 수 없다.

#### 맞춤 측정기준 등록안 — 저장하지 않음

| 표시 이름      | 범위  | 정확한 이벤트 매개변수 | 값/설명                                                     | 보고 용도                                                                               |
| -------------- | ----- | ---------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 본문 도달 구간 | Event | progress_percent       | article_progress의 숫자 25, 50, 75, 90. 독서 완료 의미 아님 | Event name=article_progress로 제한해 현재 페이지 경로별 도달 구간/사용자·이벤트 수 비교 |
| 글 이동 방향   | Event | navigation_direction   | article_navigation의 previous 또는 next                     | Event name=article_navigation에서 방향별 이동 수                                        |
| 목적지 글 경로 | Event | target_path            | 동일 origin의 /blog/<slug>/ pathname, query/hash 없음       | 출발 페이지 경로와 목적지 경로별 이동 수. 링크 클릭이며 목적지 로드 성공 증거 아님      |

직접 확인한 운영 맞춤 측정기준 0개이므로 현재 같은 정의와 중복 없음. 관리자 역할은 공식 등록 조건 Editor 이상에 해당한다. 실제 실행 직전에는 다른 작업이 추가한 정의가 없는지 매개변수/범위/표시 이름을 다시 확인해 재사용한다. Event 범위와 매개변수는 저장 후 변경 불가하므로 철자/대소문자와 설명을 검토한다.

현재 글 주소/Views/Event name/사용자 수 등은 기본 측정기준·지표를 사용하고 post_id/현재 경로를 추가 등록하지 않는다. 기본 Percent scrolled는 전체 페이지 scroll이며 본문 구간과 다르다. 기본 Link URL은 자동 클릭 계열 값이며 현재 article_navigation은 link_url 대신 target_path를 보낸다. 목적지 페이지 경로는 도착 조회이지 출발 글의 클릭 목적지를 대체하지 못하므로 계약을 바꾸지 않는 이번 등록안에서는 세 매개변수 모두 필요하다. path는 글 수에 따라 종류가 늘 수 있어 고유 사용자ID/시각/임의 토큰을 붙이지 않는다.

공식 근거: [이벤트 범위 생성 안내](https://support.google.com/analytics/answer/14239696?hl=en), [맞춤 정의·기본 정의 재사용·카디널리티](https://support.google.com/analytics/answer/14240153?hl=en-EN). 생성 안내 원문 open은 timeout이었고 공식 검색 결과에 제공된 본문으로 필드/권한/24–48시간 설명을 읽었다. 다른 공식 맞춤 정의 문서는 원문을 열어 대조했다. 보고서 반영 시간은 수신과 등록 뒤 통상 24–48시간 설명이며 확정 SLA가 아니다. 테스트 속성의 현재 정의/권한은 이번에 읽지 않아 미확인; 운영의 0개 상태를 테스트 속성에도 적용하지 않는다.

#### 내부·개발자 트래픽 처리 제안

| 구분          | 판별                                     | 현재 / 제안                                                                | Testing 확인 조건                                                                                                                                               | Active 판단 기준                                                                                                                       |
| ------------- | ---------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 내부 트래픽   | 스트림의 IP 규칙 → traffic_type=internal | 운영 규칙 0개, 제외 필터만 Testing. 정의와 필터 값을 맞추는 별도 작업 필요 | 승인 뒤 본인 통제 네트워크의 IPv4/IPv6·외부 비교 회선에서 합성 이벤트를 보내 해당/비해당을 확인. 탐색의 Test data filter name × Event name × Event count로 구분 | 공유 회선/동적 IP/VPN으로 일반 방문자가 같이 제외되지 않음, 운영자 대상 포함, 재확인/유지 책임·범위 승인. 정의 없는 지금 전환하지 않음 |
| 개발자 트래픽 | debug_mode의 디버그 이벤트               | 운영 개발자 필터 없음. 별도 승인 뒤 제외/Testing 생성 후보                 | 테스트 속성에서 debug 있음/없음 비교. DebugView 수신과 Test data filter name의 판별이 맞는지 확인                                                               | 운영 일반 방문자는 debug 매개변수 미포함, QA만 판별. DebugView는 유지하되 보고서 제외가 목적에 맞는지 승인                             |

현재 production 코드에는 debug_mode를 넣지 않고 stage만 true다. 일반 운영 방문을 개발자 트래픽으로 표시하지 않는다. `#ga_debug`/Tag Assistant의 query 추가는 현재 query/hash 게이트와 충돌할 수 있으므로 도구를 붙이면 자동 검증 가능하다고 가정하지 않는다. 테스트 모드 데이터는 제외 완료가 아니며 남아 있다. 필터는 과거 데이터를 정리하지 않는다. Active 제외로 잃은 데이터는 복구할 수 없으므로 UI가 있다는 이유로 바로 켜지 않는다.

공식 근거: [IP 내부 트래픽](https://support.google.com/analytics/answer/10104470?hl=en), [개발자 트래픽](https://support.google.com/analytics/answer/13296662?hl=en), [데이터 필터](https://support.google.com/analytics/answer/13296761?hl=en), [DebugView](https://support.google.com/analytics/answer/7201382?hl=en). 개발자 필터는 DebugView와 보고서 제외를 분리하며 적용에 24–36시간이 걸릴 수 있다는 공식 설명을 고려한다. 실제 운영 IP/인증 정보를 문서에 쓰지 않는다. 테스트 속성 필터 상태는 실제 검증 전 읽기 확인해야 하며 지연 보고서 검증 전에 Active 제외를 적용하면 그 증거와 충돌한다.

#### noindex를 유지하는 격리 검증 설계

**현재 코드 그대로 가능한 것은 무수집/모의 검증이다. 실제 Google 양성 검증은 noindex 게이트와 충돌한다.** noindex는 Google 태그의 기술적 요구가 아니라 이 사이트가 둔 수집 보호 조건이다. 이를 구분해 제한된 검증 전용 조건을 설계하되 이번에 구현하지 않는다.

| 계층                 | 읽은 현재 게이트                                                                                                | 격리 양성 검증에 필요한 변경(미실행)                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 빌드/BaseLayout      | DEV 제외, ID/target/정확한 origin, ALLOW_INDEXING=true, 공개 글 또는 비활성 D1 템플릿                           | 별도 validation target와 확정 HTTPS origin 한 곳·테스트 ID만 허용. indexable과 검증 가능 여부를 분리; 일반 stage/prod 조건 유지, 기본 값은 disabled                                                                     |
| Worker/renderArticle | template-indexable, 허용 조합, SITE_ORIGIN=실제 origin, 성공 CMS 응답에서만 ID 활성; indexable이면 robots index | validation target + 서버 접근 허용 + 합성 slug allowlist에서만 테스트 ID 활성. robots는 항상 noindex,nofollow 및 X-Robots-Tag; 내부 템플릿 404와 오류 제외 유지                                                         |
| 클라이언트           | noindex/none/robots 누락이면 종료; HTTPS, /blog/<slug>/, 실제 origin 일치, query 없음, stage는 #ga_debug        | 기존 일반 경로 noindex 차단 유지. 서버가 표시한 validation 문서 + 정확한 origin + 테스트 ID + 합성 path + 명시적 검증 모드에만 noindex 예외. 누락/다른 ID/다른 origin은 종료. 동의/저장 실패/철회 보호는 공유 코드 유지 |
| 라우팅/리소스        | stage CMS 바인딩, /blog/* Worker 우선, robots.txt는 ALLOW_INDEXING 연동                                         | 전용 Worker/config에만 인증 적용. 기존 stage CMS·운영 D1/R2·관리 API에 연결하지 않는 합성 fixture 바인딩; 허용 HTML/이미지/JS 외 응답 제한, no-store                                                                    |
| 검증 스크립트/CI     | noindex에는 ID 없음 단언, stage/prod만 허용                                                                     | validation의 매우 좁은 예외를 양·음성 단언에 추가. wrong ID/origin/환경/path/미인증/noindex 일반 stage/운영 프로필 제외 검증. 운영 CI 활성화 경로에 검증 ID를 추가하지 않음                                             |

| 선택지                                                 | 접근 제한/노출 방지                                                                                                                                                                                  | 호환성과 영향                                                                                                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 별도 HTTPS 검증 origin + 합성 글(추천)              | 전용 접근 인증을 모든 HTML/자산에 적용, 인증되지 않은 요청에는 본문/활성 표식 제공 안 함. 허용자에게도 meta/header noindex,nofollow, sitemap/RSS/운영 링크 없음, canonical은 운영 글로 지정하지 않음 | build/Worker/client에 위 validation 조건 필요. 기존 stage noindex 유지 및 운영 자원과 분리하기 쉬움. origin·인증 방식·실제 보호 동작은 생성 전 결정/검사 필요                    |
| B. 기존 stage의 제한된 합성 /blog/ga-validation-* 경로 | 해당 경로/자산에 서버 인증, meta/header noindex 유지, 외부 목록/피드/검색 제외. 일반 stage는 ID 없음                                                                                                 | stage 고정 origin은 재사용 가능하지만 별도 target/allowlist/noindex 예외/합성 CMS 분기를 동일하게 마련해야 함. 기존 stage CMS/미리보기·캐시와 섞일 위험 및 더 좁은 접근제어 필요 |
| C. 로컬 fixture + Google stub                          | 로컬만, 외부 Google 요청 없음                                                                                                                                                                        | 현재 모의 보호 검사 재사용 가능. 쿠키의 Google 실제 동작/Network/DebugView 양성 수신 증거로 사용할 수 없음                                                                       |

A의 최소 변경 대상 후보는 BaseLayout, analytics.ts, Worker article 분기, 전용 Worker 설정, 기존 두 분석 검증 스크립트와 합성 fixture다. auth에는 검증 origin용 기존 플랫폼 접근제어를 우선 검토하고 직접 토큰/새 인증 시스템을 만들지 않는다. 플랫폼 설정/가격/계정 지원 여부는 이번에 확인하지 않아 특정 서비스가 이미 사용 가능하다고 단정하지 않는다. 새 origin 이름은 이번에 확정/생성하지 않았다. 브라우저 DOM에서 noindex만 제거하거나 robots를 index로 바꾸는 임시 우회는 검증안으로 채택하지 않는다.

**검색 차단의 한계:** [Google noindex 공식 문서](https://developers.google.com/search/docs/crawling-indexing/block-indexing)는 crawler가 noindex를 읽을 수 있어야 한다고 설명한다. robots.txt Disallow만으로 URL 노출 방지를 보장하지 않는다. 인증은 콘텐츠 접근을 막고 noindex는 허용 응답에 유지한다. 인증/Disallow 때문에 Googlebot이 noindex를 읽지 못하는 충돌을 명시하며 ‘모든 검색엔진에서 URL 절대 미노출’로 증명하지 않는다. 이를 해결한다며 인증이나 기존 stage robots를 해제하지 않는다.

검증 origin은 /blog/ga-validation-long/, short/, image/, previous/, next/ 같은 **새 합성 글만** 사용한다. 실제 운영 글·초안·이미지를 복제/수정/삭제하지 않는다. 로컬 이미지로 늦은 로드/크기 변화 조건을 만들고 악성 값 시험은 실개인정보 대신 합성 문자열을 사용한다. 일반 관리·로그인·404·privacy·템플릿 경로는 무수집 상태로 제공한다. 별도 검증 origin의 origin별 localStorage/host 쿠키는 운영 것과 분리한다.

검증 모드는 인증 완료 후 서버가 제공한 대상 문서에서만 debug_mode=true로 유지하는 안을 우선 검토한다. query에 접근 토큰을 넣지 않고, 인증 콜백이 query/hash를 남긴다면 정리된 대상 URL로 안전하게 redirect하는 설계가 필요하다. 이전/다음 링크에도 검증 문서 조건이 이어져야 한다. 기존 #ga_debug를 모든 페이지에 복사/강제하는 우회만으로 이동 검증을 완료하지 않는다. 허용 전 태그 차단은 그대로이며 검증 표시만으로 동의 처리까지 자동 허용하지 않는다.

태그·collect 요청이 인증 프록시나 CSP에 막히면 차단 원인을 증거로 남긴다. 외부 Google 요청은 동의 후 정상 브라우저 요청으로만 보내고 서버 Measurement Protocol 우회는 사용하지 않는다. 필요한 CSP 허용은 검증 공개 글에 한정해 승인된 호스트만 검토한다. 로그인/관리 CSP의 self·nonce·DENY 등은 완화하지 않는다. 외부 Google로 인증 쿠키/토큰이 전송되지 않는지 및 HTTP Referer를 별도 확인한다.

#### 다음 실제 검증 체크리스트 — 전부 미실행

사전 조건: 별도 사용자 지시, 선택한 격리 방식/origin/접근제어와 필요한 코드 변경 승인, 테스트 속성 연결·권한·향상된 측정·필터 읽기 확인, 테스트 ID만 있는 산출물/응답, clean 브라우저 프로필. GA 설정 조정 승인과 환경 구현/배포 승인과 실제 Google 수신 승인은 구분한다. 과거 테스트 속성의 page_view 기록은 재사용하지 않는다.

| 사례                                   | 기대 결과 / 남길 증거                                                                                                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 최초 방문/거부/재방문                  | 스크립트 0, Google 분석 요청 0, consent 선택 상태. 화면과 Network 함께 기록; HTML 문자열만으로 요청 부재 증명 안 함                                                                                                                      |
| 명시 허용/저장된 허용/반복 허용        | 동의 뒤 테스트 gtag 1회, page_view 문서당 1회, dl/dr은 origin+pathname, dt=devlog, tid는 테스트 ID. 이벤트 수는 요청 개수가 아닌 batch payload 내부 이벤트로 계산                                                                        |
| 긴 글                                  | 의도적으로 구간 도달 시 25/50/75/90 각각 1회. 위로/아래로 반복·resize·숨김/표시·이미지 load 후 중복 없음                                                                                                                                 |
| 짧은 글/높이 0/이미지 글               | 짧은 글 초기 여러 threshold는 예상 결과로 기록. 본문 없거나 높이 0이면 progress 없음. 늦은 이미지 확대로 이미 보낸 구간 재전송 없음                                                                                                      |
| 일반 클릭/키보드 Enter/새 탭/보조 클릭 | 이전/다음마다 방향과 안전 target_path 1회, 정상 기본 이동. Ctrl/Cmd/중간 클릭 포함. 소스 navigation 수신과 목적지 별도 page_view 수신 구분                                                                                               |
| 뒤로 가기/BFCache/중복 리스너          | persisted 여부 기록. 같은 문서 복원 config/동일 progress 반복 없음. 철회된 상태의 복원은 무수집. 새 문서는 새 조회로 구분                                                                                                                |
| 태그 차단/실패                         | 글/검색/키보드/링크 이동 정상. 우회 전송·강제 재시도 없음. 외부 요청 실패를 수신 성공으로 기록하지 않음                                                                                                                                  |
| 철회/다른 탭                           | 저장 denied, opt-out/ga-disable, 새 문서 무태그, 이후 scroll/click/visibility/pageshow에서 새 수집 없음. 철회 이전 in-flight 응답과 이후 신규 요청 구분                                                                                  |
| 쿠키 생성/갱신/철회                    | 허용 뒤 테스트 호스트의 이름/domain/path/expiry/갱신 확인, 철회 뒤 해당 GA 쿠키 결과. 다른 호스트/인증/theme 보존. cookie 값·client ID는 저장소 기록에 남기지 않음                                                                       |
| 저장 실패/거부 저장 실패               | 최초 실패 및 이미 허용된 상태에서 실패 각각 검사. 수집 재개 없음·상태 안내·기본 기능 유지. 쿠키/자동 이벤트의 실제 정지까지 확인                                                                                                         |
| URL·입력·자동 이벤트                   | 처음 query/hash/합성 token은 초기화 제외. 허용 후 URL/hash/history 변화, 검색 입력, 링크 URL·파일명·영상/폼 매개변수 등 유지 자동 이벤트의 실제 payload 점검. 합성 민감 값은 Network에도 없어야 함; 이메일 수정만으로 통과 처리하지 않음 |
| 제외 경로/인증 실패                    | login/write/admin/404/privacy/article-template/collection-template/list-template/미인증/허용 밖 synthetic path 무태그·무수집. 각 응답/robots/DOM/Network 확인                                                                            |
| ID·origin·robots 회귀                  | wrong ID/운영 ID/일반 stage noindex/누락 robots/다른 origin은 차단. 오직 인증된 validation allowlist + 테스트 ID + noindex 문서만 승인한 예외대로 동작                                                                                   |

실제 Google 요청을 허용하기 전 자동 이벤트 합성 payload에서 민감 값 위험이 발견되면 해당 양성 사례를 멈추고 정리/비활성화안을 먼저 준비한다. 테스트 자료라고 개인정보·토큰 전송을 허용하지 않는다.

#### 완료 조건과 증거 양식

| 단계           | 완료 조건                                                                                                                                                  | 아직 증명하지 못하는 것                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 전송           | Network에서 승인된 tid·이벤트/매개변수·동의 후 시각·응답 결과를 확인                                                                                       | HTTP 성공/204만으로 GA 화면 수신·보고 반영 확정 불가                        |
| 실제 수신      | **현재 구현**의 테스트 속성 DebugView에서 같은 테스트 장치/시각/합성 path의 page_view, article_progress 4개 구간, article_navigation 두 방향·매개변수 확인 | 지연 표준 보고서·운영 수신 성공 아님                                        |
| 지연 보고      | 테스트 속성에 승인 뒤 등록한 정의와 non-excluded 데이터가 보고서/탐색에 반영. 24–48시간 설명을 기준으로 실제 확인 시각/필터 상태 기록                      | 운영 배포 성공 아님; debug Active 제외 데이터로 보고서 반영을 기대하지 않음 |
| 이후 운영 인수 | **다른 승인 단계:** 운영 배포 후 Network/Realtime/제외 경로와 동의 보호, 이후 운영 맞춤 정의의 지연 보고 확인                                              | 이번 준비의 완료 조건에 포함하지 않음                                       |

```text
사례 ID / 기대 결과:
실행 승인 범위 / 실행자 / KST 시작·종료:
코드 HEAD + 로컬 diff 식별(미커밋 포함) / 배포 버전:
검증 origin / 합성 path / 응답 status / 인증 허용·거부:
robots meta / X-Robots-Tag / sitemap·피드 제외:
GA 속성·스트림·tid / 향상된 측정 및 필터 상태:
브라우저·버전 / clean profile / consent 이전·이후 / BFCache persisted:
동작·기대 이벤트 수 / 실제 이벤트 수(batch 내부 기준):
Network: tag 요청 시각, collect 시각·결과, 이벤트명·안전 매개변수:
DebugView: 테스트 장치 별칭, 수신 시각, 이벤트명·매개변수 일치:
쿠키: 이름·scope·expiry·철회 결과(값/clientID 비기록):
보고서: 정의 등록/수신 시각, 조회 시각, 차원/값/필터·지연 상태:
민감 값 부재·운영 tid 부재 / 화면·정리된 payload 증거 위치:
판정: PASS / FAIL / BLOCKED / 미실행 / 보고 지연 대기
확인 범위 / 한계 / 필요한 후속 조치:
```

HAR/화면에는 인증 헤더·쿠키·개인 IP·실 사용자/장치 식별자가 섞일 수 있다. 그대로 Git에 넣지 않고 필요한 합성 이벤트·안전 값만 추린다. 수신 확인은 테스트 장치로 한정하며 기존 방문자/메일 조회·삭제는 금지 상태다.

#### 실행 전에 필요한 사용자 선택 — 한 번에 검토할 목록

이번 문서 준비에는 답변이 필요하지 않아 추가 질문을 반복하지 않았다. 아래 선택은 **다음 실행의 입력**이며 이 표로 설정/배포/양성 검증이 승인된 것은 아니다.

| 선택                | 후보와 영향                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 격리 환경           | A 별도 인증된 HTTPS origin(추천): 기존 stage 영향 최소, 새 origin/접근 설정 필요. B stage 합성 제한 경로: origin 재사용, stage 안에서 콘텐츠·권한·예외 범위를 더 엄격하게 분리해야 함. C 모의만: 실제 수신 미완료 유지 |
| 자동 외부 링크 분석 | ① 불필요하여 끔: 글 조회/진행률/내부 이동 목적만 유지. ② 필요하여 조건부 유지: URL/payload 검사와 개인정보 안내 범위 추가 필요. 검사 실패 시 활성화 보류                                                               |
| 실행 범위           | 운영 GA 설정 조정 / 테스트 속성 설정·등록 / validation 코드 구현 / 접근·환경 생성·배포 / Google 양성 수신·쿠키 검사 중 지시한 범위만 수행. 운영 활성화·merge·production 배포는 별도                                    |

#### 이번 검증과 종료

문서만 추가하여 빌드·태그 실행·쿠키 검증을 반복하지 않았다. 이전 327페이지/활성 0 빌드와 모의/Worker PASS는 이전 기록이며 이번 새 검사로 기록하지 않는다. 이번에는 문서 추가분 포맷, 두 폴더 `git diff --check`, 원문 prefix 및 기존 변경 파일 SHA-256 보존을 확인하는 것으로 한정한다. 실행 결과는 아래 종료 검증 기록에 남긴다.

계정별 공급자 계약·국외 처리·세션/백업 삭제 기준·권리 조치의 실행 가능성은 기존 개인정보 운영 문서의 출시 조건으로 유지한다. 이번에 법률 조사나 계정/기기 감사를 반복하지 않았으며 전체 법률 준수·출시 준비 완료를 확정하지 않는다. 인계의 새 ‘GA 설정/격리 검증 다음 단계’ 절을 사용하고 여기서 멈춘다. 다음 체크리스트 자동 시작 금지.

#### 종료 검증 기록 — 2026-10-05

- 새 계획/인계 추가분의 Prettier 검사 PASS, 두 폴더 `git diff --check` PASS. 기존 비대상 변경 파일 SHA-256 동일, 계획/인계 원문 prefix 보존, 시작 변경 파일 집합 동일, 두 폴더 새 추가분 동일, 구현 HEAD 동일을 단언해 PASS했다.
- 이번에는 빌드·typecheck·모의 분석 검사·Worker 검사·원격 CI를 실행하지 않았다. 준비 문서만 변경하여 기존 검증 결과를 새 실행 결과로 재사용하지 않는다. 실제 Google 요청·쿠키·수신·보고서 반영은 미실행이다.


### 최소 완료 경로 실행 — 2026-10-05

사용자의 후속 지시 **“최소 완료 경로대로 작업해봐”**에 따라 운영 설정, 테스트 정의, 좁은 validation 예외와 격리 환경을 진행했다. 이후 **“신규 가입 없이 가능한 인증 방식을 검토해줘”**를 반영했다. 앞 절의 ‘미실행’은 당시 기록이며 아래 직접 실행 결과로 해당 항목만 갱신한다. 개인정보 문서의 별도 출시 조건은 유지한다.

#### 보존과 현재 범위

- 구현 트리/브랜치/시작 HEAD는 `/Users/seungjun/.codex/worktrees/ga4-completion/devlog`, `codex/ga4-completion`, `e8a22d38c093514d34fb1b3489db1a0a1a562dc7`이다. 시작 시 두 폴더 변경 파일, tracked diff, SHA-256을 `/tmp/devlog-ga4-minimal-20261005-start`에 보존했다. 이전 `/tmp/devlog-ga4-preparation-20261005`도 유지한다.
- 기본 폴더 `/Users/seungjun/Documents/devlog`에는 다른 사용자 변경이 있어 쓰지 않았다. 이 절의 기본 폴더용 추가 기록은 별도 `/tmp` 산출물로 준비하며 기본 계획에 자동 적용하지 않는다.
- 운영 D1/R2/글/초안/이미지, 실제 방문자·메일 자료를 조회·복제·수정·삭제하지 않았다. 합성 환경은 운영 CMS/D1/R2에 바인딩하지 않는다.

#### 직접 적용한 GA 설정

| 대상                                                        | 적용/읽기 결과                                                                                                                                                                                                                                                                                        | 한계                                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 운영 `410455528 / 557066996 / 15942609257 / G-RQ6456HXLD`   | 페이지 로드 조회 유지, 브라우저 기록 조회·scroll·outbound click·search·form·video·download 끔. 저장 후 재열어 값 확인                                                                                                                                                                                 | 실제 운영 브라우저 payload 검사·수신 아님                                                                                |
| 운영 맞춤 정의                                              | Event 범위 `progress_percent`, `navigation_direction`, `target_path` 3개 신규 등록. 저장 후 목록 3행 확인                                                                                                                                                                                             | 정의 등록만으로 데이터 발생/보고 반영 완료 아님                                                                          |
| 테스트 `410497967 / 557072864 / 15941128089 / G-8SFTFGKZ9Y` | 별도 계정 `devlog`, 속성 `devlog-test`. 스트림 URL은 기존 stage. 최초 로딩 중 OFF 표시는 유효한 확인이 아니었다. 로딩 완료 재확인에서 7항목과 history ON을 읽고, 페이지 로드만 유지하고 나머지 6항목/history를 OFF로 저장·재열어 확인. 관리자 1행, Internal Traffic 제외/Testing, 개발자 필터 행 없음 | 테스트 IP 내부 트래픽 규칙은 이번 미확인. Testing을 실제 제외로 설명하지 않음                                            |
| 테스트 맞춤 정의                                            | 같은 Event 매개변수 3개 등록, 저장 후 목록 확인                                                                                                                                                                                                                                                       | 기본 config 조회는 유지하며 실제 자동 scroll 발견을 통해 설정을 재확인했다. 과거 테스트 수신을 이번 증거로 사용하지 않음 |

표시 이름/설명은 앞 등록안을 사용했다. 공유·약관·보관·Signals·광고·필터는 변경하지 않았다. 운영 보관 2/14개월·basic 동의·localStorage 자동 만료 없음 등 채택한 결정은 유지한다. 운영 자동 외부 링크 측정은 최소 목적에 불필요하여 끔으로 진행했다. `privacy.astro`에는 확인된 자동 측정 설정만 반영했고 초안과 별도 출시 조건을 유지했다.

증거 화면은 로컬 `/tmp/devlog-ga4-production-measurement-20261005.jpg`, `/tmp/devlog-ga4-production-definitions-20261005.jpg`, `/tmp/devlog-ga4-test-definitions-20261005.jpg`, `/tmp/devlog-ga4-test-measurement-20261005.jpg`다. 인증 정보·쿠키 값/client ID·raw HAR를 Git에 넣지 않는다.

#### 가입 없는 격리 방식 A의 구현/배포

검증 origin은 `https://devlog-ga-validation.seungjun-jeong10.workers.dev`다. Cloudflare Access 신청 화면에 신규 가입·약관·무료 한도 초과 카드 청구 승인 항목이 있어 신청하지 않았다. 기존 Workers의 [공식 Basic 인증 예제](https://developers.cloudflare.com/workers/examples/basic-auth/)와 secret을 사용했다. 비밀번호 대체 기본값 없이 secret이 없거나 맞지 않으면 모든 HTML/자산을 401로 차단한다. 토큰을 URL에 넣지 않으며 브라우저 암호 저장·새 계약 동의는 하지 않았다.

- `analytics.ts`: validation target + 정확한 HTTPS origin + 테스트 ID + 서버 인증 표식 + 정확한 합성 pathname + noindex/nofollow + query/hash 없음에서만 수집 가능. 일반 stage/production의 noindex 차단은 유지한다. 이전/다음 목적지에도 합성 allowlist를 적용하며 validation은 별도 hash를 요구하지 않는다.
- `worker/site.mjs`: 기존 `renderArticle`을 공유해 D1 글과 같은 HTMLRewriter/본문/이동 표식을 검증한다. 인증된 전용 wrapper만 validation 환경 표식을 공급한다. 일반 site에서 `/ga-validation/`는 404다.
- `src/pages/ga-validation/[fixture].astro`: validation 빌드에만 만드는 비활성 합성 템플릿. 기존 AnalyticsConsent와 분석 모듈을 사용한다. 실제 글·CMS 탐색·React island를 포함하지 않아 BaseLayout 수정은 필요하지 않았다.
- `worker/ga-validation.mjs`, `wrangler.ga-validation.jsonc`: 합성 긴/짧은/이미지/previous/next 글 5개와 합성 SVG, 안내, 최소 자산만 제공. 모든 응답 no-store/noindex,nofollow/no-referrer. ASSETS 외 바인딩 없음, 기존 stage/운영 배포 설정 변경 없음.
- `scripts/prepare-ga-validation.mjs`: 합성 템플릿에서 참조한 자산 3개만 별도 ignored 디렉터리에 준비한다. 실제 HTML/이미지를 업로드하지 않는다. 검증 폰트는 시스템 폰트로 제한한다.
- 기존 두 분석 검증 스크립트에 인증·ID/origin/target/path/robots/query/hash 양·음성 검사를 추가했다. 새로운 의존성은 추가하지 않았다.

실제 배포는 **전용 검증 Worker만**이다. 코드 업로드 버전 `7135a2f6-3743-404a-8f91-3fd8e574cf0d`, secret 등록 후 실제 100% 버전 `78a3c353-15ef-4bce-a81b-241bd77f5370`을 `wrangler deployments list`로 확인했다. 자격 증명은 Git 밖 mode 0600 로컬 파일에 보관하고 secret 값은 출력하지 않았다. 종료/재개 시 전용 secret의 유지·폐기 여부를 따로 판단한다.

원격 HTTP 검사: 인증 실패 401, 인증한 합성 5경로 200/test ID/서버 인증 표식/noindex header/no-store, 안내·robots 200/활성 ID 없음, sitemap/RSS/API/템플릿 404. 운영 ID는 응답에 없었다. 첫 검사에서 자격 증명 JSON의 필드명을 잘못 사용해 401을 받았고 필드명 수정 후 양성 검사를 수행했다. Python HTTP 검사의 로컬 CA 오류는 PASS로 기록하지 않았으며 TLS 검증을 끄지 않고 curl/Node 정상 검증으로 확인했다.

인증과 robots Disallow로 crawler가 noindex를 읽지 못할 수 있다. [Google noindex 문서](https://developers.google.com/search/docs/crawling-indexing/block-indexing)의 한계를 유지하며 검색 URL의 절대 미노출을 보장하지 않는다.

#### 이번 로컬 검증 결과

| 검사                                                         | 결과                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `pnpm check`                                                 | 89 files, 0 errors / 0 warnings / 6 hints                                             |
| validation 빌드와 `GA4_EXPECTED_TARGET=validation` 분석 검사 | 328 pages / 일반 활성 0, 합성 템플릿만 비활성 설정, 모의 PASS                         |
| 기본 disabled 빌드/분석 검사                                 | 327 pages / 활성 0, 모의 PASS                                                         |
| 로컬 production 설정 빌드/분석 검사                          | 327 pages / 활성 공개 글 125, 모의 PASS. 운영 활성화·배포 아님                        |
| `verify-analytics-runtime.mjs`                               | 실제 Workers HTMLRewriter와 합성 인증/robots/ID/오류/제외 회귀 PASS. Google 요청 없음 |
| CI의 D1 routes/series/content/search/security/image-cleanup  | 전부 PASS, 로컬 합성 자료만 사용                                                      |
| 수정 코드 Prettier / `git diff --check`                      | PASS                                                                                  |

빌드 로그는 `/tmp/devlog-ga4-minimal-{check,validation-build,default-build,production-build}.log`다. 기존 원격 CI 성공은 이번 변경의 성공으로 재사용하지 않는다.

#### 실제 브라우저 검증과 출시 상태

실제 Google 태그·쿠키·Network/DebugView 양성 수신은 **아직 미완료**다. 현재 사용 중인 Chrome와 네이티브 검증 창 제어가 충돌해 별도 Playwright 브라우저 사용 가능 여부를 요청했고, 사용자가 **“별도 Playwright 브라우저로 검증”**을 선택했다. 기존 Chrome·운영 데이터를 사용하지 않는 합성 검증 스크립트 `/tmp/devlog-ga4-live-validation-20261005.mjs`를 실행했다. 번들에 Playwright 전용 Chromium 바이너리가 없어 기존 Chrome 바이너리를 새 임시 프로필의 headless 프로세스로 사용했다. 실제 결과는 아래 추가 기록과 구분한다. 동의/무수집·BFCache·쿠키·민감 값·양성 수신을 모의 PASS나 HTTP 200으로 완료 처리하지 않는다.

기존 개인정보 출시 조건인 계정별 공급자 계약·국외 처리, 세션/백업의 최종 삭제 기준, 안전한 권리 행사 실행 가능성은 여전히 미확정이다. 이미 답변한 운영 정책을 재질문하거나 전체 계정·기기 감사로 확대하지 않는다. 이러한 조건과 실제 수신 검증이 충족되기 전 production 활성화/인덱싱 변수 변경·merge·운영 배포를 진행하지 않는다. 정의/보고서의 통상 [24–48시간 준비 기간](https://support.google.com/analytics/answer/14239696?hl=en) 이후에도 실제 보고 값을 확인해야 하므로 현재 글별 운영 지표 목표는 완료가 아니다.

#### 실제 Playwright / Network / 쿠키 결과 — 2026-10-05 추가

앞 ‘아직 미완료’는 첫 브라우저 실행 전 상태다. 이후 사용자 승인에 따라 기존 Chrome 프로필과 분리한 Playwright 프로세스에서 합성 origin만 검증했다. TLS/CSP/인증/noindex를 우회하지 않았고 Google 요청에는 테스트 ID만 사용했다. 설치된 Chrome 154.0.8037.93과 기존 Playwright를 사용했으며 새 의존성을 설치하지 않았다.

| 검증 항목                 | 직접 결과                                                                                 | 증거/한계                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 동의 전 / 거부 후 재방문  | Google 태그 0, 요청 0, GA 쿠키 0                                                          | 새 임시 프로필. 허용 선택 전 실제 무수집                                                                                                                                                            |
| 허용 뒤 긴 글             | `page_view` 1회, `article_progress` 25/50/75/90 각 1회                                    | 반복 스크롤·resize 후 구간 중복 없음, 각 수집 이벤트 HTTP 204                                                                                                                                       |
| 짧은 글 / 이미지 글       | 각 새 문서 조회 1회, 도달 4구간                                                           | 이미지 글과 resize 뒤 추가 구간 이벤트 없음. 지연 로드 전체 조건의 별도 대조는 미완료. 도달은 독서 완료 지표 아님                                                                                   |
| 키보드 이전 / 일반 다음   | native 이동 성공, 양방향 `article_navigation` HTTP 204                                    | 출발 글의 `page_location`, 안전한 목적지 `target_path` 확인. 링크에 debug query/hash를 붙이지 않아도 목적지 테스트 수집 이어짐                                                                      |
| 새 탭 / 가운데 클릭       | 출발 글 이동 이벤트 각각 1회 HTTP 204, 새 문서 조회                                       | 원래 링크 동작을 지연·대체하지 않음                                                                                                                                                                 |
| 뒤로 가기                 | 새 문서 조회 관찰                                                                         | headless/별도 일반 창 모두 `pageshow.persisted=false`. 실제 BFCache 복원은 **관찰하지 못함**; 모의 동일 문서 중복 방지는 PASS지만 실제 BFCache 증거로 대체하지 않음                                 |
| 철회 / 다른 탭            | 해당 호스트 GA 쿠키 0, 이후 Google 요청 0, 다른 탭 재로드 후 태그 0                       | 테마·인증 자료를 삭제하지 않음. Google 서버의 기존 데이터 삭제 아님                                                                                                                                 |
| 저장 실패                 | 최초 허용 저장 실패 시 태그·요청 0; 실행 중 철회 저장 실패 시 쿠키 0/새 이벤트 0          | 실패 안내 문구 확인. 저장된 선택·전체 브라우저 상태 감사 아님                                                                                                                                       |
| 태그 차단                 | 이전·다음 링크 정상 이동                                                                  | 태그를 차단한 별도 프로필. 수신 성공 검사가 아님                                                                                                                                                    |
| query/hash / 합성 민감 값 | 최초 query/hash URL 수집 0. 허용 후 history 변경도 조회 추가 없이 안전한 주소만 전송      | `synthetic-secret-DO-NOT-SEND` 값이 수집 payload에 없음을 검사. 임의의 모든 민감 데이터 부재 보장은 아님                                                                                            |
| 제외 경로                 | privacy/목록용 sitemap/RSS/API/내부 템플릿/login/write/admin/미승인 합성 경로 태그·요청 0 | 전용 wrapper의 허용 경로 외에는 404                                                                                                                                                                 |
| Google 요청 격리          | 테스트 ID만, Authorization 헤더 없음, HTTP Referer 없음                                   | [Playwright HTTP 자격 증명](https://playwright.dev/docs/api/class-browser#browser-new-context-option-http-credentials)을 정확한 origin에 제한. raw HAR·쿠키 값·client ID·개인 IP·인증 값 저장 안 함 |

주 검증은 KST **20:06:00–20:07:24**, 추가 새 탭/history/철회 실패 검증은 **20:15:56–20:16:47**에 수행했다. headless 주 검증에서 기록한 수집 이벤트 20개는 모두 HTTP 204를 받았다. 별도 `ERR_ABORTED` 요청 12개도 관찰했으므로 모든 Google 요청이 성공했다고 일반화하지 않는다. 선택한 조회·도달·이동 이벤트의 응답과 Google 화면 수신은 별도 대조했다. 이후 별도 일반 창에서 긴/짧은/이미지와 native 키보드 양방향을 다시 실행해 각각 HTTP 204를 확인했다.

값을 제외한 증거는 Git 밖 `/tmp/devlog-ga4-live-evidence-20261005.json`, `/tmp/devlog-ga4-live-followup-evidence-20261005.json`, `/tmp/devlog-ga4-live-headed-core-evidence-20261005.json`에 있다. 실행 스크립트도 `/tmp`에 보관했다. 쿠키 메타정보는 `_ga`, `_ga_8SFTFGKZ9Y`, Domain `.devlog-ga-validation.seungjun-jeong10.workers.dev`, Path `/`, Secure, SameSite=Lax, HttpOnly=false, 실행 당시 약 400일 만료였다. [Chrome의 400일 제한](https://developer.chrome.com/blog/cookie-max-age-expires/)과 [Google 기본 2년/갱신 설정](https://developers.google.com/analytics/devguides/collection/ga4/reference/config#cookie_expires)을 구분한다. 브라우저·운영 origin의 결과를 검증 origin에서 대신 확정하지 않는다. 운영 쿠키 override 꺼짐은 2026-10-03 읽기 기록이며 이번 재확인은 아니다.

#### 실제 검증에서 고친 두 문제와 측정 한계

1. Google은 명시적인 Domain 쿠키를 만들었는데 기존 철회는 host-only 만료만 써서 실제 쿠키가 남았다. 현재 호스트의 host-only와 Domain 두 범위를 모두 만료시키고 `cookie_flags='SameSite=Lax;Secure'`를 명시했다. 실제 철회 후 GA 쿠키 0을 확인했다.
2. 같은 탭을 떠날 때 큐에 넣은 이동 이벤트가 실제 Google Network에 나타나지 않았다. 콜백/이동 대기를 시도했지만 해결하지 못해 제거했다. 현재는 허용된 같은 탭 클릭의 출발 주소·목적지 pathname·방향·시각 **한 건만** sessionStorage에 보관하고, 다음 동의한 대상 문서가 10초 안에 읽으면 삭제한 뒤 출발 글의 클릭 이벤트로 보낸다. config 기본 조회 1회는 유지하며 수동 page_view를 추가하지 않았다. 새 탭/가운데 클릭은 살아 있는 출발 문서에서 전송한다.

임시 이동 값은 query/hash·식별자·인증 정보를 담지 않는다. 읽을 때 삭제하고 거부·철회 때 폐기한다. **10초는 이벤트 사용 조건이며 물리 삭제 타이머가 아니다.** 다음 문서에서 읽지 못하면 탭 종료까지 남을 수 있다. 세션 저장 실패, 10초 초과, 목적지 수집 조건 미충족, 차단·종료 시 클릭이 누락될 수 있으므로 모든 클릭 수나 목적지 로드 성공률을 보장하지 않는다. 재시도 큐·서버 분석 저장·방문 이력을 추가하지 않았다. 공개 초안과 합성 안내에도 이 저장 범위와 한계를 반영했다. 기존 localStorage 동의 보관 결정과 GA CSV/BigQuery/자체 DB 내보내기 금지는 유지한다.

회귀 검사는 같은 탭 한 건 저장/다음 문서 한 번 소비, 출발 글 귀속, 거부 상태 폐기, 외부·query·잘못된 목적지·만료 값 거절, 동일 문서 BFCache 모의 중복 방지와 쿠키 Domain 만료를 기존 분석 스크립트에 추가했다.

#### Google 화면 수신과 아직 남은 완료 조건

테스트 속성 `devlog-test / 557072864`의 DebugView에서 이번 별도 일반 창의 `page_view`, `article_progress`, `article_navigation`, 기본 `first_visit/session_start/user_engagement`가 실제 표시됐다. 조회의 합성 `page_location`, 도달 이벤트 한 묶음의 **25/50/75/90**, 이동의 **previous → /blog/ga-validation-next/** 및 **next → /blog/ga-validation-short/**, 출발 위치 `/blog/ga-validation-long/`를 매개변수 패널에서 읽었다. 초기에 기기/이벤트 0이었고 이후 기기 숫자 0 표시가 남아도 이벤트 타임라인과 인기 이벤트 31개가 표시됐다. 숫자 하나만으로 미수신을 확정하지 않는다. headless 실행만으로는 화면 수신을 확인하지 못했으며 그 원인은 확정하지 않았다. 개인정보 보호를 풀거나 가짜 User-Agent로 바꾸지 않았다.

[Google DebugView 공식 안내](https://support.google.com/analytics/answer/7201382?hl=en)의 config `debug_mode:true`를 사용했다. Tag Assistant가 넣는 query를 허용하거나 noindex를 제거하지 않았다. 테스트 데이터 필터는 다시 읽어 Internal Traffic/제외/Testing 한 행, 개발자 필터 행 없음으로 확인했고 변경하지 않았다. Testing은 실제 제외 완료가 아니다. 내부 IP 규칙은 이번 미확인 상태를 유지한다.

수신 화면 증거: `/tmp/devlog-ga4-test-debugview-received-20261005.jpg`, `devlog-ga4-test-debugview-page-view-20261005.jpg`, `devlog-ga4-test-debugview-progress-20261005.jpg`, `devlog-ga4-test-debugview-navigation-{previous,next}-20261005.jpg`. 처음 미수신 화면은 당시 증거로만 보존한다. 추가 일반 창의 전체 글별 DebugView 매개변수 대조, 실제 BFCache 복원 및 지연 보고서 값은 아직 별도 확인할 부분이다. Network와 DebugView 양성 수신을 표준 보고 반영 완료로 확대하지 않는다.

- 지연 보고서는 아직 확인하지 않았다. 맞춤 정의는 통상 [24–48시간 후 보고/탐색 사용 가능](https://support.google.com/analytics/answer/14239696?hl=en)하며 실제 값 확인 전까지 대기다. 자동 후속 일정은 생성하지 않았다.
- 계정별 공급자 계약·국외 처리·세션/백업 최종 삭제 기준·안전한 권리 행사 실행과 남은 메일 사본 사실은 기존 출시 조건으로 유지한다. 기존 공개자료 조사를 반복하거나 사용자의 답변을 전체 감사로 확대하지 않았다.
- 따라서 원래 목표인 **운영 GA의 글별 조회수/지표 확인은 아직 완료가 아니다.** 출시 조건을 충족한 뒤에만 최종 안내 시행일 확정, merge/활성화/운영 배포, 운영 Network/Realtime, 운영 지연 보고를 완료해야 한다.

#### 최종 코드 검증과 Git 정리 준비

navigation/cookie 수정 뒤 production 로컬 빌드 327페이지/활성 글125, disabled 빌드 327페이지/활성0, 두 분석 검사 모두 PASS. 최종 `dist`는 disabled다. 잘못된 로컬 환경 변수명으로 첫 production 빌드가 보호 오류로 중단됐으며 올바른 `PUBLIC_GA_MEASUREMENT_ID`와 승인 ID를 넣은 새 빌드가 통과했다. 원격 활성화 변수는 변경하지 않았다. `pnpm check` 및 수정 코드 Prettier/diff 검사, 최종 빌드 로그는 `/tmp/devlog-ga4-final-*-20261005.log`에 기록한다. 위의 원격 CI는 이전 HEAD의 증거이며 이번 수정 CI 상태는 PR의 실제 최신 head에서 확인한다.

기본 폴더 시작 변경 파일의 SHA-256이 모두 같고 구현 계획의 시작 원문 prefix가 유지됨을 확인했다. AnalyticsConsent는 시작 스냅샷과 동일하다. 이번 scoped 구현·개인정보 준비 문서를 draft PR에 올려 리뷰 가능한 상태로 정리하며, 공개 초안/시행일 미기입·출시 조건 때문에 merge·운영 변수 변경·stage/production 배포는 진행하지 않는다. 전용 validation Worker의 안내 문구 최종 업로드 버전과 종료 시 Git/CI는 종료 기록·인계에서 구분한다.

#### 종료 전 추가 수신·배포 기록

KST **20:21:21–20:22:22**의 별도 일반 창 핵심 재검증에서도 긴 글 조회 1회/도달 25·50·75·90, native 키보드 이전/일반 다음, 짧은/이미지 조회 1회/도달 4구간/resize 후 중복 없음이 통과했다. 기록한 수집 이벤트 20개 모두 HTTP 204였다. 이어 최신 DebugView에서 긴 글 조회 및 긴/이미지 글의 4구간과 각 합성 `page_location`, native next의 출발 `/blog/ga-validation-next/`와 목적지 `/blog/ga-validation-long/`, native previous 방향을 직접 펼쳐 읽었다. 짧은 글의 조회·4구간·경로는 앞 별도 일반 창에서 대조했다. 핵심 긴/짧은/이미지 수신은 확인했으며 모든 상호작용 조합의 완전한 대조를 뜻하지 않는다. 실제 BFCache 복원, 이미지 지연 로드의 모든 조건 및 지연 보고서 값은 남아 있다.

추가 화면은 `/tmp/devlog-ga4-test-debugview-{long,image}-progress-20261005.jpg`, `/tmp/devlog-ga4-test-debugview-native-previous-20261005.jpg`다. 마지막 전용 validation 배포 버전은 **e6cfd7d7-77fc-4dde-abbc-4d43d54da4cb**다. 수신 검증 버전 `10239908-3c05-45ab-8664-e6eb8d864664` 이후 변경은 임시 저장 안내에 ‘시각’을 명시한 문구이며 수집 로직은 동일하다. 최종 check는 0 errors/0 warnings/6 hints이며 최종 disabled 빌드·두 분석 스크립트를 다시 통과시킨 후 Git을 정리한다.

최종 HTTP 재검사에서도 인증 없는 글은 401이고 인증한 최종 안내는 200/noindex/활성 분석 설정 없음이었다. ‘운영 ID 없음’의 범위는 활성 HTML 설정과 실제 Google tag/collect ID 검사다. 공유하는 분석 JS의 기존 production 가드·철회 상수에는 운영 ID 문자열이 남아 있지만 validation의 활성 설정/태그/수집은 테스트 ID만 사용한다. 이를 ‘모든 자산에서 운영 ID 문자열 제거’ 검사로 표현하지 않는다.

#### 코드 push와 해당 커밋 CI — 2026-10-05 종료 정리

14개 scoped 파일을 **be1b2b7046138d0bb530636117377d40690e9206** (`feat(analytics): add authenticated GA4 validation`)로 커밋하고 `origin/codex/ga4-completion`에 push했다. 이전 개인정보 준비 변경도 이 범위의 문서/동의 UI로 포함했으며 기본 폴더에는 쓰지 않았다. 실제 검증 자격 증명이 변경 파일에 없음을 값 출력 없이 검사했다.

[해당 커밋 CI 37304450343](https://github.com/whateveriiwant/devlog/actions/runs/37304450343/job/111744645915)는 **SUCCESS**다. PR을 [#34](https://github.com/whateveriiwant/devlog/pull/34)의 최신 구현·실제 수신·남은 출시 조건으로 다시 작성했고 OPEN/draft·동일 head를 확인했다. 이 단락 이후 증거를 기록하는 문서 커밋과 해당 CI는 구현 커밋 CI와 구분한다. 최종 head는 종료 요약 및 다음 인계 파일에서 실제 값을 제공한다.

merge·GA4_PRODUCTION_ENABLED/ALLOW_INDEXING 설정·stage/production 배포는 하지 않았다. 전용 validation 환경만 남아 있고 기존 출시 조건/실제 BFCache/지연 보고 대기를 유지한다. 기본 폴더용 추가 기록은 `/tmp/devlog-ga4-minimal-base-plan-appendix-20261005.md`이며 기본 계획에 자동 적용하지 않았다. 다음 체크리스트나 자동 후속 작업을 시작하지 않는다.
