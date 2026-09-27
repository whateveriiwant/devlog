# 보안 검토 기록 — 2026-09-27

## 범위와 판단 기준

- 소스: `codex/admin-backoffice`, HEAD `85d1c09e13afbad144705539217f56d11d5d24e4`. 문서 추가 전 `origin/main` (`789a152f24e487c6a4790676976fe746524a6bab`)과 소스 차이가 없었다.
- 인증/OAuth, 관리자 API, 공개 콘텐츠, Markdown 렌더링, 업로드, 정적 산출물, CI 권한과 현재 추적 파일의 일부 자격 증명 패턴을 검토했다.
- 실제 운영 확인은 인증 정보 없이 소수의 GET 요청으로 수행했다. 로그인/저장/삭제/복원이나 운영 데이터 변경은 하지 않았다.
- 운영 비밀값, 브라우저 토큰과 쿠키 값을 읽지 않았다. Cloudflare WAF·계정 권한 전체와 Git 과거 이력은 감사하지 않았다.
- 등급은 이번 코드 검토의 수정 우선순위이며 CVSS 점수가 아니다. 확인된 코드와 공격에 필요한 조건을 구분했다.
- 제품 코드는 수정하지 않았다. 이번 문서는 발견 사항과 후속 작업 기록이다.

## 요약

| ID  | 우선순위                     | 발견 사항                                                       | 근거 수준                                                    |
| --- | ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| S01 | 높음                         | 브라우저의 GitHub 쓰기 토큰 보관과 불필요하게 큰 OAuth 권한     | 코드 확정; 실제 토큰 탈취/XSS는 미확인                       |
| S02 | 중간                         | 로그아웃 후 기존 서명 세션·Bearer 토큰을 서버에서 폐기하지 않음 | 코드 확정; 실제 세션 재사용 실험은 하지 않음                 |
| S03 | 중간                         | D1 수정/삭제와 별개로 과거 본문이 든 정적 검색 파일을 계속 제공 | 코드/공개 파일 확인; 현재 삭제 글 노출 사례는 없음           |
| S04 | 중간                         | 모든 하위 도메인으로 공유되는 동일 세션 쿠키                    | 코드 확정; 하위 도메인 침해는 미확인                         |
| S05 | 낮음                         | CSP와 프레임 방어 정책 부재                                     | 홈/로그인 운영 헤더 확인; 관리자 HTML은 코드 근거            |
| S06 | 중간                         | 공개 고비용 API에 앱 수준 호출 제한이 없음                      | 코드 확정; 외부 WAF 설정/실제 공격은 미확인                  |
| S07 | 낮음                         | 레거시 관리자에서 외부 CDN 스크립트를 무결성 검사 없이 실행     | 코드 확정; CDN 침해/해당 패키지 취약점은 미확인              |
| S08 | 낮음                         | 요청 전체를 메모리에 읽은 뒤 일부 크기 제한 적용                | 코드 확정; 인증된 요청 경로, 부하 실험 없음                  |
| S09 | 개발 도구: 높음 1건·낮음 1건 | 커밋 도구의 tmp@0.0.33에 알려진 취약점 2건                      | 전체 pnpm audit와 의존성 경로 확인; 웹 원격 공격 경로 미확인 |

## 상세 발견 사항

### S01. GitHub 토큰을 JavaScript에서 읽을 수 있는 저장소에 보관

근거: `worker/cms.mjs:833–835, 1244`, `src/pages/login.astro:90–95`, `src/components/WriteEditor.tsx:129–133, 215–247`.

OAuth 콜백이 원본 GitHub access token을 팝업 메시지로 전달하고 사이트는 이를 sessionStorage에 보관한다. 로그인 요청은 현재도 `public_repo` 권한을 요구한다. 현재 D1 발행에는 GitHub 저장소 쓰기 권한이 필요하지 않지만 Git 기반 편집 경로가 남아 있다.

- 공격 조건: 로그인한 탭의 동일 origin에서 악성 JavaScript가 실행되거나 토큰이 다른 경로로 유출됨. 현재 실현 가능한 XSS를 발견했다는 뜻은 아니다.
- 영향: 토큰 유출 시 블로그 편집 API뿐 아니라 사용자가 권한을 가진 공개 GitHub 저장소들에도 토큰의 쓰기 권한이 적용될 수 있다. 이 권한은 이 저장소 하나로 한정되지 않는다.
- 권장: D1 전용 인증으로 통일하고 GitHub 토큰을 브라우저에 전달하지 않는다. 서버는 계정 확인 후 자체 HttpOnly 세션만 발급한다. 레거시 Git 편집을 제거한 뒤 OAuth 권한을 기본 공개 프로필 확인 범위로 축소한다.
- 완료 조건: 브라우저 저장소/팝업 응답에 GitHub access token이 없고 관리 API는 서버 세션으로 인증된다. 기존 넓은 권한 토큰의 폐기/재승인 처리도 확인한다.

### S02. 로그아웃이 서버 자격 증명을 폐기하지 않음

근거: `worker/cms.mjs:14, 108–119, 134–151, 1262–1274`, `src/components/WriteEditor.tsx:911–921`.

서명 세션은 login·expires·HMAC만 검증하며 서버 세션 레코드나 폐기 정보가 없다. 로그아웃은 쿠키를 지우고 현재 탭의 sessionStorage를 비운다. 이미 복사된 세션은 원래 만료 시점(발급 후 12시간)까지 검증 가능하다. 별도로 보관된 유효 GitHub Bearer 토큰도 편집 API 인증에 계속 사용할 수 있다.

- 공격 조건: 세션/토큰 사전 탈취 또는 토큰을 유지한 다른 편집 탭. 비로그인 공격자가 이것만으로 세션을 생성할 수 있는 것은 아니다.
- 권장: 폐기 가능한 무작위 세션 ID와 서버 세션 레코드를 사용한다. 로그아웃 시 레코드를 폐기하고 관리 API의 독립적인 GitHub Bearer 인증 경로를 제거한다. 사용자 전체 로그아웃이 필요한지 정책을 정한다.
- 완료 조건: 폐기된 세션과 이전 인증 경로로 관리 API가 거부된다. 만료와 로그아웃을 구분해 확인한다.

### S03. 수정/삭제해도 정적 검색 파일에는 과거 본문이 남을 수 있음

근거: `src/pages/search-index.json.ts:3–21`, `package.json:16`, `src/components/SiteControls.tsx:42–104`, `worker/site.mjs:751–789`, `wrangler.jsonc:14–32`.

빌드는 Git 글 원문을 포함한 `/search-index.json`과 Pagefind 산출물을 만든다. D1에서 글을 수정/삭제해도 이 정적 파일은 새 빌드 전까지 갱신되지 않는다. 공개 검색 파일은 관리자 인증 없이 제공된다. 런타임 검색 실패 시 예전 검색으로 fallback하기도 한다.

운영 확인:

- `/search-index.json`: HTTP 200, application/json, Content-Length 624726.
- `/pagefind/pagefind.js`: HTTP 200.
- 정적 JSON 125개와 공개 D1 목록 125개의 글 URL을 비교했고 현재 목록에서 빠진 정적 URL은 0개였다.
- 따라서 현재 삭제 글이 유출됐다고 보고하지 않는다. 수정된 본문의 내용 비교는 하지 않았다.

권장: D1 모드에서는 과거 원문 JSON/Pagefind를 배포하지 않거나 공개 접근을 차단한다. 검색 장애는 명시적으로 표시하며 예전 공개본으로 자동 전환하지 않는다. 이미 제공했던 콘텐츠의 외부 복사본까지 회수할 수 있다고 약속하지 않는다.

완료 조건: D1에서 제거/수정한 내용이 사이트가 제공하는 다른 검색/정적 경로로 다시 나타나지 않는다. 이전 배포 산출물 제거까지 확인한다.

### S04. 세션 쿠키의 하위 도메인 공유 범위

근거: `worker/cms.mjs:830–844, 108–119, 1257–1260`.

`cms_gate`는 `Domain=seungjun.sh; Path=/`이며 CMS 전용 `cms_session`과 동일한 서명값이다. 이 쿠키는 하위 도메인 요청에도 전달될 수 있다. 하위 도메인을 제어하는 서비스가 침해되면 요청에서 쿠키를 얻을 수 있으며 HttpOnly는 서버에 전달되는 쿠키를 숨기지 않는다. 같은 값이 CMS 인증에도 유효하므로 노출 범위가 넓다.

- 조건: 하위 도메인 서버 침해/잘못된 위임. 현재 그런 침해를 확인하지 않았다.
- 권장: 사이트의 같은 origin에서 로그인 콜백/인증 프록시를 처리하고 Domain 없는 host-only 세션으로 통일한다. 가능한 경우 `__Host-` 속성을 적용한다. 기존 세션의 폐기 전략을 함께 적용한다.
- 주의: 기존 CMS 호스트에서 `__Host-` 이름만 붙이면 사이트로 전달되지 않는다. 인증 경로 변경이 먼저다.

### S05. CSP와 프레임 방어 부재

근거: `worker/site.mjs:238–240, 827–830`; 코드 검색에서 CSP는 OAuth 팝업 응답에만 존재. `public/_headers` 파일 없음.

운영 홈과 로그인 HTML 응답에서 Content-Security-Policy, X-Frame-Options가 없었다. 인증된 관리자 HTML의 실제 헤더는 이번에 읽지 않았으며, 사이트 Worker에는 관리자용 정책을 추가하는 코드가 없다.

- 영향: XSS가 생겼을 때 실행/통신을 제한하는 추가 방어가 없다. 프레임 제한도 없다.
- 한계: 이것만으로 관리자 clickjacking이나 XSS가 성립한다고 단정하지 않는다. SameSite 쿠키와 브라우저의 제3자 쿠키 정책도 영향을 준다.
- 권장: 관리자/로그인에 frame-ancestors 'none'을 포함한 HTTP 응답 정책을 추가한다. 스크립트 정책은 실제 Astro 인라인 스크립트와 OAuth 팝업 동작을 고려해 hash/nonce 등으로 적용한다. Worker가 생성하는 응답에도 직접 적용한다.

### S06. 공개 고비용 API 호출 제한 부재

근거: `worker/cms.mjs:1130–1178`, `worker/site.mjs:751–787`, `worker/cms.mjs:66–74`와 Worker 설정에서 앱 수준 rate limiter 없음.

공개 검색과 태그 관계는 인증 없이 DB 검색/집계를 실행한다. 응답은 no-store다. Origin 검사만으로 호출 빈도를 통제할 수는 없다. 비브라우저 클라이언트는 Origin을 생략하거나 설정할 수 있다.

- 영향: 반복 호출로 DB 읽기/Worker 자원 사용을 증가시킬 수 있다.
- 한계: Cloudflare 대시보드의 WAF/rate limit 규칙과 실제 운영 사용량은 확인하지 않았다. 운영 전체에 보호가 없다고 단정하지 않는다.
- 권장: 공개 조회 캐시 및 적절한 경로별 호출 제한을 적용한다. 인증은 계속 별도로 검증한다. 무제한 부하 실험은 하지 않는다.

### S07. 불필요한 레거시 관리자와 외부 스크립트 실행

근거: `public/admin/legacy.html:12–13`, `public/admin/config.yml`, `worker/site.mjs:1–5`.

레거시 관리자 HTML이 unpkg의 Decap 스크립트를 integrity 속성 없이 불러온다. 버전은 고정됐지만 해당 CDN 콘텐츠를 신뢰하고 관리자 origin에서 실행한다. Git 편집 권한을 유지해야 하는 이유도 이 경로와 연결된다.

- 한계: 이 경로도 관리자 인증 대상이다. CDN 침해나 Decap의 현재 취약점을 확인하지 않았다. pnpm audit 결과는 이 외부 스크립트를 포함하지 않는다.
- 권장: 사용하지 않는다면 레거시 HTML/설정/미디어 연결과 Git 편집 fallback을 제거한다. 유지해야 한다면 통제된 번들과 무결성 검증을 검토한다.

### S08. 크기 제한 전에 요청 전체를 읽음

근거: `worker/cms.mjs:422–460, 880–892, 264–270`.

게시물은 request.json()으로 전체를 읽은 뒤 Markdown 크기를 검사한다. 이미지도 Content-Length 사전 검사 후 arrayBuffer()로 전체를 읽고 실제 크기를 검사한다. 전체 JSON 본문에 대한 별도 상한은 없다.

- 조건: 허용 계정의 인증이 필요하다. 익명 요청이 바로 이 버퍼 읽기에 들어가는 구조는 아니다.
- 권장: 전체 본문의 상한을 먼저 적용하고 필요하면 제한된 스트림 읽기로 처리한다. 플랫폼 한도만으로 앱의 10MB/Markdown 상한이 사전 집행된다고 가정하지 않는다.
- 완료 조건: 앱 상한을 넘는 본문을 전체 버퍼링 전에 중단한다. 운영에는 대용량 공격 요청을 보내지 않았다.

### S09. 개발용 커밋 도구의 알려진 tmp 취약점

근거: `package.json:74–75, 93–99`, `pnpm-lock.yaml:5254`, `pnpm audit --json`, `pnpm why tmp`.

전체 의존성 감사에서 같은 `tmp@0.0.33`에 취약점 공지 두 건이 보고됐다. 경로는 `cz-customizable@7.5.4 → inquirer@6.5.2 → external-editor@3.1.0 → tmp@0.0.33`이다. package.json과 pnpm why에서 루트 커밋 도구가 devDependency인 것을 확인했다. 감사 JSON의 개별 dev 플래그만으로 운영 의존성이라고 해석하지 않는다.

| 공지                | 감사 등급 | 내용                                                                    | 감사 데이터의 수정 버전 |
| ------------------- | --------- | ----------------------------------------------------------------------- | ----------------------- |
| GHSA-ph9p-34f9-6g65 | 높음      | prefix/postfix 등 경로 옵션의 검증 부족으로 임시 경로 밖 파일 생성 가능 | tmp >=0.2.6             |
| GHSA-52f5-9888-hmc6 | 낮음      | dir 옵션의 심볼릭 링크를 이용한 임시 디렉터리 범위 이탈                 | tmp >=0.2.4             |

- 영향/조건: 해당 개발 도구 경로의 임시 파일 생성 옵션에 공격자가 영향을 주는 상황을 검토해야 한다. 현재 블로그 HTTP 입력이 이 도구로 전달되는 경로는 확인하지 않았다. 운영 웹의 원격 파일 쓰기 취약점으로 단정하지 않는다.
- 권장: 상위 커밋 도구의 의존성 업데이트를 검토하거나 사용하지 않는다면 제거한다. 버전 간 API 호환을 확인하지 않은 tmp 강제 override는 먼저 적용하지 않는다.
- 완료 조건: 전체 의존성 감사에서 두 공지가 제거되고 사용 중인 커밋 도구가 정상 동작한다.

## 확인된 방어와 결과

### 인증 없이 수행한 운영 GET 확인

| 경로                        | 결과                                                            |
| --------------------------- | --------------------------------------------------------------- |
| `/admin/`                   | 302, `/login/?next=%2Fadmin%2F`로 이동                          |
| `/write/`                   | 302, 로그인으로 이동                                            |
| `/admin/index.html`         | 302, 로그인으로 이동                                            |
| `/write.html`               | 307, `/write/`로 이동; 해당 경로는 별도 GET에서 로그인으로 이동 |
| `/api/content/editor/posts` | 401, no-store                                                   |
| `/`                         | 200, no-store; CSP/프레임 방어 헤더 없음                        |
| `/login/`                   | 200; CSP/프레임 방어 헤더 없음                                  |
| `/search-index.json`        | 200, 과거 Git 글 본문이 포함된 공개 정적 JSON                   |
| `/pagefind/pagefind.js`     | 200, 공개 정적 검색 코드                                        |

이 소수 경로의 확인만으로 모든 인증 우회가 없다고 결론 내리지 않는다. 첫 Python urllib 요청은 연결 오류로 확인에 실패했고 이후 curl로 위 결과를 확인했다.

### 코드에서 확인한 방어

- OAuth state 쿠키와 콜백 state를 대조한다: `worker/cms.mjs:777–788`.
- 콜백과 편집 API가 허용 GitHub 로그인명을 확인한다: `worker/cms.mjs:134–151, 823–828`.
- 팝업 메시지 수신은 정확한 origin과 popup source를 확인한다: `src/pages/login.astro:76–85`.
- 관리자 페이지는 CMS에서 서명 세션 검증 후 제공한다: `worker/site.mjs:801–829`.
- 변경 API에는 Origin 확인과 별도의 계정 인증이 있다: `worker/cms.mjs:225–245`, `worker/site.mjs:762–775`. 이번 검토에서 직접 성립하는 CSRF 우회는 확인하지 않았다.
- 발행 Markdown은 rehype-sanitize를 거친다. 편집 미리보기는 DOMPurify를 거친다. 메타데이터 HTML 문자열에는 escaping을 적용한다.
- 편집 API의 SQL 사용자 값은 bind 처리한다. 이번에 직접 성립하는 SQL injection은 확인하지 않았다.
- 업로드는 인증, 허용 MIME, 실제 바이트 크기와 파일 선두 바이트를 확인한다. SVG는 허용 목록에 없다. 선두 바이트 확인만으로 완전한 이미지 디코딩 검증을 수행하는 것은 아니다.
- CI token 권한은 contents:read이고 배포 비밀값은 GitHub secrets를 참조한다. 실제 서비스 토큰의 전체 권한과 유출 이력은 이번 범위 밖이다.

### 의존성과 자격 증명 확인

- `pnpm audit --prod --json`: info/low/moderate/high/critical 모두 0건, 감사 응답 totalDependencies 589.
- 의미: 해당 시점 registry 감사 데이터에 보고된 운영 의존성 취약점이 없었다. 새 취약점이나 외부 CDN 스크립트까지 안전하다는 보증은 아니다.
- 이후 `pnpm audit --json`으로 개발 도구를 포함한 전체 그래프도 감사했다: low 1건, high 1건, 나머지 0건, totalDependencies 1218. 같은 tmp@0.0.33에 대한 공지 두 건이며 S09에 기록했다. 종료 코드 1은 취약점 보고 결과다.
- `pnpm why tmp`와 package.json으로 취약 패키지가 개발용 커밋 도구에서 유입되는 경로를 확인했다. 패키지를 업데이트/제거하지 않았다.
- 현재 Git 추적 파일에서 GitHub 토큰 형식, AWS AKIA access key 형식, private key PEM 표식을 찾는 제한된 패턴 검사: 0건.
- Git 전체 이력, 모든 Cloudflare 토큰 형식, 실제 CI 로그와 저장된 비밀값은 검사하지 않았다. 모든 비밀값이 안전하다고 결론 내리지 않는다.

## 우선 실행 제안

1. D1 전용 서버 세션으로 통일: S01/S02/S04와 성능 기록의 반복 GitHub 인증을 함께 해결한다.
2. 정적 검색 원문과 레거시 Git 편집 제거: S03/S07과 불필요한 빌드를 함께 줄인다.
3. 관리자/로그인 보안 헤더 적용: 기존 인라인 코드와 OAuth가 정상 동작하도록 구성한다.
4. 공개 API 캐시·호출 제한, 요청 본문 상한을 적용한다.
5. 커밋 도구의 취약한 tmp 의존성을 제거하거나 상위 도구를 업데이트한다.
6. 이후 저장소 private 전환을 결정한다. private 전환으로 위 웹 보안 문제가 해결되지는 않는다.

실제 구현과 운영 변경은 아직 하지 않았다.

## 참고 자료

- [OWASP 세션 관리 — 서버 폐기, Web Storage, 쿠키 범위](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP HTML5 보안 — 메시지 origin 검증과 JavaScript 저장소](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [OWASP CSP — frame-ancestors와 script 정책](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [GitHub OAuth 권한 — public_repo와 기본 프로필](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [tmp 유지관리자 공지 — GHSA-ph9p-34f9-6g65](https://github.com/raszi/node-tmp/security/advisories/GHSA-ph9p-34f9-6g65)
- [tmp 유지관리자 공지 — GHSA-52f5-9888-hmc6](https://github.com/raszi/node-tmp/security/advisories/GHSA-52f5-9888-hmc6)
