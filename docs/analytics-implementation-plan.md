# devlog GA4 프로덕션 모니터링 전환 계획

- 갱신일: 2026-10-03
- 현재 상태: 기존 분석 변경을 `codex/ga4-completion` 작업 트리에 이어받아 실제 D1 글 렌더링 경로의 분석 누락과 robots 강제 인덱싱을 수정했다. 운영 GA 계정 `410455528` / 속성 `557066996`에서 운영 스트림 `15942609257` / `G-RQ6456HXLD` 연결을 읽기 확인했다. 코드·빌드·Workers 검증은 아래 13절에 기록한다. 운영 정책은 미결정이며 GA 설정 변경·운영 활성화·production 배포는 수행하지 않았다. stage 사이트는 무수집 구성으로 배포하고 noindex와 smoke 검증을 통과했다.
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

### 아직 완료하지 않은 항목

- [ ] 운영 개인정보 안내·방문자 동의 방식 확정. 현재 코드에는 방문자 동의 선택/철회 UI나 Consent Mode가 없으므로 운영 정책이 결정되기 전 출시하지 않는다.
- [ ] 운영 GA의 향상된 측정 조정과 맞춤 측정기준 3개 등록. 자동 수집 범위와 내부 트래픽 정의/사용자 역할도 함께 확인한다.
- [x] 수정된 stage 사이트 배포, traffic 100%, 글 noindex·분석 제외와 인증/보안 smoke 확인.
- [ ] noindex 보호를 해제하지 않는 격리 검증 방법을 정한 뒤 긴/짧은/이미지 글·클릭·키보드·BFCache·차단·민감 매개변수를 실제 브라우저에서 확인한다. 이번에는 두 맞춤 이벤트의 Network/DebugView 양성 수신을 확인하지 않았다.
- [ ] 별도 승인 뒤 운영 인덱싱·GA 활성화·production 배포. 승인 전 draft PR은 merge하지 않는다.
- [ ] 배포 후 Network, Realtime, 제외 페이지, 표준 보고서/맞춤 탐색 확인. 실제 수신과 지연 보고서 확인을 별개로 기록한다.

다음 대화는 이 13절부터 이어서 위 미완료 항목만 진행한다. 다음 안정화 체크리스트 항목은 자동 시작하지 않으며 운영 글·초안·이미지를 테스트 데이터로 수정하거나 삭제하지 않는다.
