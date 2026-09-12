# GitHub · Cloudflare Pages · R2 연결 안내

현재 로컬 정적 블로그와 이전 도구를 준비한 상태입니다. 실제 도메인, GitHub 저장소, R2 bucket과 자격증명이 제공되지 않아 외부 배포·이미지 업로드는 실행하지 않았습니다. `.env.example`의 값은 비워 두었습니다.

## 1. GitHub에 소스 보관

현재 폴더를 새 저장소로 사용할 때 다음 순서로 진행합니다. 이 명령은 아직 실행하지 않았습니다.

```sh
git init -b main
git add .
git status
git commit -m "feat: migrate Velog content to Astro blog"
```

GitHub에서 원하는 이름과 공개 범위로 빈 저장소를 만든 뒤, 화면에 제공되는 실제 remote 주소를 연결하고 main을 push합니다. 사용자 계정이나 저장소 이름을 임의로 가정하지 않았습니다.

`.env`, `node_modules`, `dist`, `work`, `outputs`는 `.gitignore`에 포함했습니다. 글·원본 JSON·image manifest·검증 보고서·lockfile은 소스와 함께 보관합니다. 이미지 원본 RAW/JPEG와 `work/images` 다운로드 자료는 별도 SSD/백업에 보관하세요.

## 2. Pages에 정적 빌드 연결

Cloudflare의 Workers & Pages → Create application → Pages → 기존 Git 저장소 가져오기에서 실제 저장소를 선택합니다. 이 프로젝트의 설정은 다음과 같습니다.

| 항목 | 값 |
|---|---|
| Framework preset | Astro |
| Root directory | 프로젝트 루트 |
| Production branch | `main` |
| Build command | `pnpm check && pnpm build` |
| Build output directory | `dist` |
| `NODE_VERSION` | `24.12.0` |
| `PNPM_VERSION` | `10.28.0` |

이 프로젝트는 `output: static`이며 서버 adapter나 Pages Functions가 필요하지 않습니다. `pnpm build`가 Astro 다음에 Pagefind를 실행하므로 `dist/pagefind`도 같은 배포에 포함됩니다. Git 연동을 마친 이후 push에 따른 재배포는 Pages에서 처리합니다. [Pages의 Astro 배포 안내](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/), [Node/pnpm 버전 설정](https://developers.cloudflare.com/pages/configuration/build-image/)

처음 검토하는 배포에는 `ALLOW_INDEXING=false`를 사용합니다. 실제 최종 도메인이 정해진 뒤 Production 환경에 `SITE_URL`을 HTTPS origin으로 설정하고, 콘텐츠·경로를 확인한 뒤 `ALLOW_INDEXING=true`로 다시 배포합니다. Preview 환경은 계속 false로 유지하세요. 이미지 이전 전에는 `MEDIA_BASE_URL`을 비워 둡니다.

이름에 `.dev`가 들어간 사이트 브랜드는 Velog 프로필 표시에서 가져왔으며, 사용자가 해당 도메인을 소유했다고 가정한 것이 아닙니다. `SITE_URL`에 넣을 주소는 실제 소유한 도메인입니다.

## 3. 개인 도메인

Pages 프로젝트 → Custom domains → Set up a domain에서 도메인을 먼저 등록합니다. 루트 도메인은 Cloudflare zone/nameserver 설정이 필요하고, 서브도메인은 DNS 제공자에서 Pages 주소를 향하는 CNAME을 설정할 수도 있습니다. 정확한 레코드 값은 실제 Pages 프로젝트에서 제공된 값을 사용하세요. 도메인을 Pages에 연결하지 않고 DNS에 CNAME만 추가하는 방법은 사용하지 않습니다. [Pages custom domain 공식 안내](https://developers.cloudflare.com/pages/configuration/custom-domains/)

HTTPS가 동작하는 것을 확인한 뒤 재빌드하면 다음 값이 최종 도메인으로 생성됩니다.

- 페이지별 canonical과 Open Graph URL
- RSS의 절대 URL
- `/sitemap-index.xml`과 sitemap 파일
- `/robots.txt`의 sitemap 위치

404는 항상 noindex입니다. 실제 도메인을 지정하지 않은 개발 빌드에는 sitemap이 없습니다.

## 4. 기존 이미지 271개를 R2로 이전

`image-manifest.json`은 본문 238개 참조와 썸네일을 합친 353개 참조를 담습니다. 동일 URL을 중복 제거하면 271개입니다. 각 행에는 sourcePost, sourceTitle, originalUrl, filename, alt, kind, line, R2 key가 있습니다.

key는 원래 URL의 SHA-256 앞부분과 확장자로 만듭니다. 본문 Markdown의 원래 URL은 보존하며, 렌더링할 때만 검증된 R2 주소로 매핑합니다. 검증 전 새 URL로 일괄 바꾸어 사진이 깨지는 일을 막기 위해 build가 이전 검증 보고서를 확인합니다.

1. 블로그 공개용 R2 bucket을 준비합니다. 비공개 원본 RAW/JPEG와 별개로 공개용 파일만 담습니다.
2. 해당 bucket에 대한 객체 읽기/쓰기 권한이 있는 R2 S3 자격증명을 발급합니다. `.env.example`을 `.env`로 복사하고 `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`에 실제 값을 입력합니다. 이 값은 브라우저 코드에 사용되지 않습니다.
3. 다음 다운로드 명령을 실행합니다.

```sh
pnpm images:download
```

원래 공개 HTTPS URL에서 다운로드하여 `work/images/velog/`에 저장합니다. MIME, 빈 파일, 파일 크기 제한, SHA-256을 확인하고 `migration/image-downloads.json`에 기록합니다. 이미 받은 파일은 SHA-256이 맞으면 건너뜁니다. 실패하면 보고서를 확인한 뒤 같은 명령으로 재시도할 수 있습니다.

4. 다운로드가 모두 성공하면 업로드합니다.

```sh
pnpm images:upload
```

모든 로컬 파일을 먼저 검증한 다음 업로드합니다. 같은 key가 있으면 저장된 SHA-256 metadata가 동일할 때만 건너뜁니다. 다른 파일을 임의로 덮어쓰거나 기존 객체를 삭제하지 않습니다. 결과는 `migration/image-uploads.json`입니다. R2의 S3 호환 endpoint와 `region: auto`를 사용합니다. [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/)

5. R2 bucket → Settings → Custom Domains에서 실제 이미지 서브도메인을 연결하고 Active 상태가 된 것을 확인합니다. Production에는 사용자 custom domain을 사용합니다. R2 기본 bucket은 공개 상태가 아니며, `r2.dev`는 개발용입니다. [R2 공개 bucket과 도메인 연결](https://developers.cloudflare.com/r2/buckets/public-buckets/)
6. `.env`의 `MEDIA_BASE_URL`에 이미지 도메인의 HTTPS origin을 입력합니다. 경로·query·인증 정보는 넣지 않습니다. 아직 이 상태로 사이트를 빌드하지 말고 먼저 아래를 실행합니다.

```sh
pnpm images:verify
```

실제 공개 주소에서 271개 이미지를 다시 GET하여 다운로드한 파일의 SHA-256과 비교합니다. 전부 일치한 경우에만 `migration/image-verification.json`의 `complete`가 true가 됩니다.

7. 검증 보고서를 소스에 포함하고 빌드합니다.

```sh
pnpm build
pnpm verify:build
pnpm preview
```

본문과 썸네일/Open Graph가 같은 이미지 매핑을 사용합니다. Pages 환경에도 동일한 `MEDIA_BASE_URL`을 설정하고 재배포합니다. R2 업로드 자격증명은 로컬 이전에만 필요하며 정적 사이트 빌드 환경에는 넣을 필요가 없습니다.

되돌려야 하면 `MEDIA_BASE_URL`을 비우고 다시 빌드하세요. 원래 URL과 본문이 남아 있어 매핑을 해제할 수 있습니다. 완전한 플랫폼 독립은 이 이미지 다운로드·업로드·공개 주소 검증까지 끝난 이후에 달성됩니다.

현재는 스크립트 문법과 설정 누락 시 중단하는 동작만 확인했습니다. 실제 이미지 가용성·R2 업로드·도메인·DNS·TLS의 성공을 확인한 상태가 아닙니다.

## 5. URL과 검색엔진 전환

기존 slug를 유지하고 새 사이트에서는 `/blog/<slug>/`로 사용합니다. 모든 글의 `originalUrl`이 원래 Velog 주소를 보존합니다. 수집된 글 사이의 Velog 링크는 렌더링 시 새 경로로 연결하며, 원본 파일 자체의 링크를 지우지 않습니다.

새 사이트 공개 시 자신의 새 URL을 canonical로 지정하고 sitemap을 제출합니다. canonical과 sitemap은 검색엔진에 선호 URL을 알리는 신호이며, 기존 Velog 문서가 자동으로 사라지거나 새 사이트가 반드시 대표 URL로 선택된다는 보장은 없습니다. [Google의 canonical·redirect·sitemap 안내](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

Velog에서 사용자가 다른 도메인으로 HTTP redirect 또는 cross-domain canonical을 지정할 수 있는지는 이번 도구로 확인하지 못했습니다. **I cannot verify this with the available tools.** 존재한다고 가정하여 redirect 파일이나 설정을 만들지 않았습니다. 새 사이트의 redirect 규칙으로 `velog.io` 서버의 응답을 제어할 수는 없습니다.

실행 순서는 다음과 같습니다.

1. 새 사이트에서 전체 글, 이미지, 실제 도메인, canonical/RSS/sitemap을 확인합니다.
2. Search Console에 새 도메인을 등록하고 sitemap을 제출한 뒤 대표 URL 선택과 색인 상태를 관찰합니다.
3. 사용자가 Velog 글을 편집할 때 이전 안내와 해당 새 글 링크를 넣습니다. 기존 본문 유지 또는 요약 전환 여부는 백업과 방문 경로를 확인한 뒤 사용자가 결정합니다. 기존 글은 이번 작업에서 수정하거나 삭제하지 않았습니다.
4. `pages.dev`, www 등 자신이 제어하는 부가 주소는 필요할 때 최종 도메인으로 정리합니다. Pages의 production 주소 전환은 공식 custom domain 안내를 따릅니다.

`robots.txt` 차단은 중복 문서 대표 URL을 지정하는 도구로 사용하지 않습니다. 새 사이트 미리보기의 noindex 설정과 공개 사이트의 canonical 설정은 목적이 다릅니다.
