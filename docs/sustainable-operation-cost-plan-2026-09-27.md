# 장기 운영과 비용 절감 계획 — 2026-09-27

## 결론

현재 Astro + 사이트/CMS Workers + D1 + R2 + GitHub Actions를 유지한다. 공개 조회의 반복 DB 작업, 고비용 검색/집계와 불필요한 빌드를 줄이는 것이 우선이다. 다른 프레임워크나 DB로 옮기는 비용과 유지보수 부담을 먼저 만들지 않는다.

목표는 서비스 요금 $0 운영을 가능한 한 유지하는 것이다. 무료 플랜의 CPU/조회/저장 한도로 정상 기능이 불안정해지는 경우 Workers Paid 최소 $5/월을 허용하는 선택지를 둔다. $5는 고정 상한이 아니라 기본료이며 초과 사용은 추가 과금될 수 있다.

이 문서는 설계 제안이다. 요금제, 배포, 스케줄, 저장소 공개 범위, 보관 정책을 변경하지 않았다.

## 근거와 확인하지 못한 항목

- `wrangler.jsonc`, `wrangler.cms.jsonc`: 프로덕션 사이트/CMS Worker, Service Binding, D1, R2와 별도 스테이징 리소스가 있다.
- `worker/site.mjs:291–299`: 홈이 글/시리즈/태그/통계를 요청한다.
- `worker/cms.mjs:1130–1178`: 태그 관계 전체 집계와 LIKE 본문 검색이 있다.
- `.github/workflows/ci.yml:3–7, 48–71`: PR/main의 전체 빌드와 main에서 두 Worker 배포.
- `.github/workflows/cleanup-unused-images.yml:4–5, 26–37`: 하루 한 번 이미지 정리, 전체 이력 checkout/의존성 설치.
- `scripts/cleanup-unused-images.mjs:43–71, 197–225`: 삭제 후보마다 Wrangler 재실행, 최신 참조 재확인과 7일 유예.
- `src/components/WriteEditor.tsx:89–119`: JPEG/PNG를 최대 변 2400px로 줄이고 더 작은 WebP로 변환하는 처리.
- `migration/image-manifest.json`: 이관 당시 레코드 352개. 파일에 실제 byte 크기가 없어 R2 현재 저장량으로 계산하지 않는다.
- 현재 청구서, Cloudflare/GitHub 계정 플랜, 최근 요청/CPU/rows_read, D1/R2 실제 크기, CDN 적중, 다른 프로젝트 사용량은 확인하지 않았다. 현재 월 청구액은 알 수 없다.
- 요금은 아래 공식 문서를 확인했다. USD 기준이며 세금, 환율, 도메인 갱신과 별도 유료 기능은 제외한다.

## 공식 무료 범위와 유료 전환 경계

| 서비스                | 확인한 무료 범위                                                        | 주의사항                                                                                   |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Workers 동적 실행     | 하루 100,000 요청, 호출당 CPU 10ms                                      | 현재 공개 글/목록은 Worker를 실행한다. 무료 적합성은 긴 글 발행까지 확인해야 한다.         |
| Workers Static Assets | 직접 정적 파일 제공은 무료·무제한, 별도 Assets 저장 요금 없음           | run_worker_first에 걸리는 공개 페이지는 동적 요청 한도 대상이다.                           |
| D1                    | 하루 500만 행 읽기, 10만 행 쓰기, 계정 저장 총 5GB                      | 무료 DB 하나는 500MB 한도. 무료 한도 초과 시 조회/쓰기 오류가 발생할 수 있다.              |
| R2 Standard           | 월 10GB-month, Class A 100만 회, Class B 1,000만 회, 인터넷 전송료 없음 | 한도를 넘는 저장/작업 요금은 별도다. Infrequent Access에는 이 무료 구간이 적용되지 않는다. |
| GitHub Actions        | 공개 저장소 표준 실행기는 무료. GitHub Free의 private은 월 2,000분 포함 | 실제 계정 플랜과 다른 저장소 사용량, artifact/cache 저장도 고려한다.                       |

출처: [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/), [Static Assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [D1 요금](https://developers.cloudflare.com/d1/platform/pricing/), [D1 제한](https://developers.cloudflare.com/d1/platform/limits/), [R2 요금](https://developers.cloudflare.com/r2/pricing/), [Actions 요금](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Workers Paid 기본료는 계정당 최소 $5/월이며 월 1,000만 요청과 3,000만 CPU-ms가 포함된다. 이를 넘으면 각각 추가 100만 요청당 $0.30, 100만 CPU-ms당 $0.02다. 현재 사이트→CMS Service Binding에는 Standard 요금 모델에서 추가 요청 요금이 없으며 두 Worker의 CPU 사용은 합산된다. 비용만을 이유로 합칠 필요는 없다. 기존 계정이 과거 요금 모델이면 별도 확인한다. 출처: [Workers 요금과 Service Binding](https://developers.cloudflare.com/workers/platform/pricing/).

R2 Standard의 초과 저장 단가는 $0.015/GB-month, Class A $4.50/100만 회, Class B $0.36/100만 회다. 과금 단위 올림이 있으므로 소수 사용량의 단순 비례 계산을 실제 청구액으로 약속하지 않는다. 출처: [R2 요금](https://developers.cloudflare.com/r2/pricing/).

## 절감 조치의 우선순위

### 1. 공개 조회의 DB 읽기를 줄인다

성능 기록의 공개 캐시, 검색 결과 재사용, 태그 관계 범위 제한과 서버 페이지네이션을 적용한다. D1 비용/한도는 반환한 글 수가 아니라 읽은 행 수에 영향을 받는다. 인덱스를 추가할 때는 읽기 감소와 저장/쓰기 증가를 함께 확인한다.

- 홈의 전체 태그/시리즈 집계는 캐시를 재사용한다.
- 태그 관계는 화면의 상위 태그 범위로 제한하고 공개 조회마다 다시 계산하지 않는다.
- 검색 결과 더 보기는 받은 결과를 재사용한다. 검색 호출과 중복 쿼리를 줄인다.
- 검색 FTS5 전환은 한글 품질과 실제 rows_read를 확인한 후 결정한다.
- 캐시 적중에서도 Worker 요청 수가 무조건 0이 되는 것은 아니다. 우선 줄이는 대상은 DB 읽기와 CPU다.
- 캐시는 발행·수정·삭제·복원 시 무효화와 함께 구현한다. Cache API의 delete는 호출한 데이터센터에만 적용되므로 전역 무효화 방식과 플랜별 제한을 확인한다.
- 관리자 응답, 초안, 인증 쿠키/토큰은 공개 캐시에 넣지 않는다. 삭제한 글의 예전 정적 검색 파일을 fallback으로 쓰지 않는다.

출처: [D1 과금 정의](https://developers.cloudflare.com/d1/platform/pricing/), [Workers Cache API와 전역 purge](https://developers.cloudflare.com/workers/runtime-apis/cache/). 코드 근거는 [성능 기록](./performance-review-2026-09-27.md)에 있다.

### 2. 이미지를 업로드할 때 가볍게 만들고 오래 캐시한다

- 현재 브라우저의 JPEG/PNG 축소·WebP 변환을 유지한다. 화질과 텍스트 가독성을 보고 정책을 조정한다.
- 썸네일은 업로드 때 작은 파일 하나를 생성해 재사용하는 방식을 우선 검토한다. 요청마다 유료 변환을 실행하는 서비스를 먼저 추가하지 않는다.
- `media.seungjun.sh`의 실제 R2 custom domain/CDN 캐시 설정과 적중률을 확인한다. 코드의 Cache-Control 메타데이터만으로 CDN 적중을 보장하지 않는다.
- 무작위 파일명은 덮어쓰기 대신 새 URL을 써서 긴 캐시를 유지한다. GIF/영상처럼 큰 파일은 업로드 제한과 안내를 별도로 결정한다.
- R2 Standard를 유지한다. 공개 블로그 이미지에 Infrequent Access를 적용해 작은 저장 단가 차이를 얻으려다 읽기/회수 요금과 운영 부담을 늘리지 않는다.

출처: [R2 custom domain 캐시](https://developers.cloudflare.com/r2/buckets/public-buckets/), [R2 저장 등급별 요금](https://developers.cloudflare.com/r2/pricing/).

### 3. 하루 한 번 정리를 유지하되 실행을 가볍게 한다

7일 유예와 최신 참조 확인은 유지한다. 현재 marker 생성 시점을 기준으로 유예를 계산하므로, 스케줄 빈도를 낮추면 업로드 실수부터 실제 삭제까지 더 오래 걸릴 수 있다. 먼저 조회 묶음 처리, 불필요한 전체 Git 이력과 전체 도구 설치를 줄이는 쪽을 검토한다.

Git 참조 검사는 레거시 Git 편집과 이미지 소유권을 정리한 뒤에만 제거한다. 사용 중인 이미지가 잘못 삭제될 위험을 비용 절감 명목으로 늘리지 않는다.

R2 lifecycle의 단순 생성 후 7일 삭제를 `posts/` 전체에 적용하지 않는다. 객체 나이는 미사용 기간과 다르다. lifecycle은 백업 전용 prefix 등 안전한 보관 정책에만 사용한다. 출처: [Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

### 4. 코드 변경에 필요한 CI/CD만 실행한다

- Worker만 바뀌면 전체 정적 사이트/Pagefind 빌드와 관계없는 Worker 배포를 생략하도록 경로별 작업을 나눈다.
- 문서만 바뀌면 배포를 생략한다.
- 글 발행은 계속 D1 경로를 사용하며 commit/PR/build를 요구하지 않는다.
- pnpm cache를 유지한다. 성공 로그와 불필요한 산출물은 무기한 보관하지 않는다.
- public 무료 실행만을 이유로 운영 저장소를 공개할 필요는 없다. private 전환 전 실제 포함 분과 저장량을 확인한다.
- GitHub의 예산 알림과 필요 시 Stop usage 옵션을 검토한다. 알림만 설정하면 중단되지 않으며 첫 청구 주기 등 예외도 있으므로 완전한 즉시 요금 상한으로 약속하지 않는다.

출처: [Actions 요금](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [GitHub 예산·알림](https://docs.github.com/en/billing/concepts/budgets-and-alerts).

### 5. 공격과 실수로 비용이 커지는 것을 막는다

- 보안 기록의 브라우저 GitHub 토큰 제거, 폐기 가능한 세션, OAuth 권한 축소를 우선 처리한다.
- 고비용 검색/관계 API의 호출 제한과 짧은 오류 응답을 적용한다. Cloudflare 대시보드의 기존 WAF와 실제 무료 기능 범위를 먼저 확인한다.
- Paid를 사용한다면 Worker별 CPU 상한을 정상 발행/조회에 필요한 범위로 설정한다. 한도는 전체 월 청구액을 고정하지 않는다.
- 요청 본문, 토큰과 초안 전체를 로그로 남기지 않는다. 오류와 필요한 지표를 중심으로 로그량을 제한한다.
- R2·D1·Worker·CI 전체의 실제 사용량을 함께 본다. 새로운 Redis/KV/Queue/외부 모니터링 구독을 먼저 추가하지 않는다.

보안 근거: [보안 기록](./security-review-2026-09-27.md). CPU 제어 근거: [Workers 요금의 Custom limits](https://developers.cloudflare.com/workers/platform/pricing/).

## 장기 데이터 보호와 이전 가능성

비용을 줄이더라도 원문과 이미지 복구를 포기하지 않는다.

- D1 Time Travel은 Free 7일, Paid 30일이다. 장기간 외부 백업의 대체품으로 가정하지 않는다.
- 제안 정책: SQL 백업을 주 1회, 최근 4회 보관하고 월별 백업은 최근 12회 보관한다. 아직 자동화는 만들지 않았다.
- 백업은 개인 저장장치 또는 암호화된 별도 private 저장 위치에 보관한다. 공개 이미지 버킷에 SQL/초안/세션 데이터를 올리지 않는다. R2를 쓰면 백업 보관량도 합산해 계산한다.
- 이미지도 별도 복구 수단이 필요하다. SQL만으로 삭제된 R2 객체를 복구할 수 없다. 이미지 7일 삭제 정책과 SQL 복구 기간이 다르므로 오래된 백업의 이미지 완전 복구를 보장하지 않는다. 원하는 복구 기간에 맞는 이미지 사본/보관 정책을 함께 정한다.
- 기존 `scripts/export-d1-markdown.mjs`는 SQL 백업에서 Markdown/시리즈/초안을 내보내는 오프라인 도구다. 다른 호스팅으로 이전할 때 활용할 수 있다.
- `scripts/export-d1-snapshot.mjs`는 기존 Git 콘텐츠에서 D1 초기 데이터를 만드는 도구다. 현재 운영 DB 백업 도구로 혼동하지 않는다.
- 제안: 분기마다 소수의 글·초안·이미지를 로컬에서 복구해 확인한다. 지금 실행하지 않았다.
- 계정 복구 수단, 도메인 자동 갱신과 만료 확인도 장기 운영 목록에 포함한다. 현재 등록업체/갱신 가격은 확인하지 않았다.

출처: [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## 비용 규모 예시 — 현재 청구액이 아닌 가정

| 예시               | 가정과 계산                                                           | 해석                                                                           |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 글 1,000개 이미지  | 글당 5장 × 평균 300KB = 약 1.5GB                                      | 원본 이미지 기준 예시. 썸네일·백업·스테이징은 추가다.                          |
| 글 10,000개 이미지 | 같은 가정에서 약 15GB                                                 | 무료 10GB를 5GB 초과하면 저장 단가만 월 $0.075. 작업량/다른 저장은 별도다.     |
| 전체 스캔 검색     | 5,000행을 읽는 검색 × 하루 1,000회 = 500만 행                         | 검색 하나만으로 Free의 하루 읽기량에 도달하는 가정. 실제 쿼리 측정치는 아니다. |
| private CI + 정리  | 코드 변경 월 40회 × PR/main 2회 × 각 2분 + 정리 30회 × 각 2분 = 220분 | GitHub Free 2,000분 내의 예시. 실제 시간, 다른 작업과 저장량은 별도다.         |
| Paid 기본료        | $5 × 12개월 = 연 $60                                                  | 초과 사용·도메인·세금 별도. 계정 기본료는 Worker 개수만큼 곱하지 않는다.       |

DB에는 Markdown, HTML, 검색 텍스트와 인덱스가 함께 저장된다. 글 수만으로 용량을 예측하지 말고 실제 database size와 증가량을 사용한다.

## 계측과 전환 기준 제안

아래 숫자는 공급자 정책이 아닌 운영 여유를 확보하기 위한 제안값이다.

| 지표             | 확인할 값                                    | 제안 대응 기준                                                          |
| ---------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| 동적 Worker 요청 | 하루 최대 요청과 CPU 상위 구간               | Free 요청 70% 수준이 반복되거나 정상 발행이 CPU 한도를 넘으면 Paid 검토 |
| D1 읽기/쓰기     | 하루 최대, endpoint별 rows_read/rows_written | Free 일일 한도 70%에서 검색·집계·봇 요청부터 점검                       |
| D1 저장          | 운영 DB 크기, 스테이징 포함 계정 총량        | Free 운영 DB가 약 350MB에 접근하면 성장률·Paid 전환 검토                |
| R2               | 저장 GB-month, A/B 작업량, 이미지 적중       | 약 8GB 또는 작업량 무료분 70%에서 원본 크기·정리·백업 보관량 점검       |
| GitHub           | 월 실행 분, artifact/cache 저장과 예산 설정  | 포함 분 70%에서 불필요한 빌드/정리 설치 비용 점검                       |

월 1회 사용량과 청구서를 확인하는 운영 습관을 제안한다. 알림 자동화는 아직 만들지 않았다. Free 한도 초과로 생기는 장애와 Paid 초과 과금을 구분해 대응한다.

## 권장 운영 선택

1. 현재 청구/사용량과 CPU 적합성을 먼저 확인한다. 이미 Paid라면 무료로 내리기 전에 긴 글 발행과 DB 크기를 확인한다.
2. 앞선 보안 문제와 반복 인증/목록 과다 조회를 해결한다.
3. 공개 캐시 + 무효화, 검색/태그 조회량, 이미지 크기를 줄인다.
4. CI/이미지 정리와 백업 보관 정책을 가볍게 정리한다.
5. 무료 범위와 정상 기능을 함께 만족하면 그대로 유지한다. 불안정해지면 최소 Paid로 전환하되 계측과 비용 방어는 계속 유지한다.

관련 기록: [성능 분석](./performance-review-2026-09-27.md), [보안 분석](./security-review-2026-09-27.md).
