# 운영 콘텐츠 백업·복구 절차

## 보호 대상과 보관

- 운영 DB: `devlog-content`. 글·초안·휴지통·시리즈·이미지 참조·요청 기록을 SQL로 보관한다.
- 원본 이미지 버킷: `devlog-assets` 전체 객체. 참조 테이블에 없는 이미지도 포함한다.
- 백업 버킷: 별도 `devlog-content-backups`, Standard. 생성 후 r2.dev 공개 접근이 꺼져 있고 custom domain이 없는 것을 API로 확인했다.
- 원격 백업은 AES-256-GCM으로 암호화한다. 암호화 키는 백업 버킷에 넣지 않는다. 무결성 인증에 실패하면 복호화 결과를 완성 파일로 남기지 않는다.
- 각 스냅샷에 이미지 전체 사본이 있어 이전 스냅샷에 의존하지 않는다. 원본 이미지의 7일 미사용 삭제 정책은 변경하지 않는다.
- 자동 보관 정책: 주간 성공 백업 최근 4회, 월별 최근 12개. 같은 달의 월별 파일은 최신 성공본으로 갱신한다. 신규 주간·월간 업로드 둘 다 성공한 뒤 소유한 이름의 오래된 백업만 정리한다.
- 최초 `initial/` 백업은 자동 정리 대상이 아니다. 별도 판단 없이 삭제하지 않는다.

## 현재 상태 — 2026-09-27

- 실제 운영 D1을 SQL로 내보냈고 별도 SQLite 복원·무결성·외래 키 검사를 수행했다.
- 로컬 스냅샷: `/Users/seungjun/Library/Application Support/devlog-backups/manual/2026-09-27T1449Z`.
- 표의 글 수에는 휴지통을 포함한다: 글 126건, 공개 125건, 휴지통 1건, 별도 초안 1건, 시리즈 23개.
- 이미지 참조 고유 키 201개. 버킷 전체 객체 278개, 합계 147,127,400 bytes. 빈 정리 표식도 포함한다.
- 이미지 전체 크기·ETag 확인 후 SHA-256을 기록했다. 별도 복원에서 278개 객체의 크기·해시와 201개 참조 존재를 확인했다.
- 기존 Markdown 내보내기도 실행해 공개 글 125개·숨긴 글 1개·별도 초안 1개·시리즈 23개가 보존되는 것을 확인했다.
- 암호화 원격 파일: `devlog-content-backups/initial/2026-09-27-content.bin`, 142,295,076 bytes. 업로드 완료를 확인했다.
- 원격 파일을 다시 다운로드해 업로드 전 파일과 SHA-256이 같은지 확인했다. 복호화·별도 SQLite 복원 및 전체 278개 객체/201개 참조 검증을 통과했다.
- 암호화 파일의 바이트를 변경한 별도 사본은 복호화가 거절됐고, 실패한 평문 출력과 임시 파일이 남지 않는 것을 확인했다.
- 암호화 키: GitHub Actions `CONTENT_BACKUP_KEY`와 로컬 `devlog-backups/keys/content-backup.key`. 로컬 키는 소유자만 읽고 쓰는 0600 권한이다. 키 내용은 문서·Git·로그에 남기지 않는다.
- 2026-09-28: 백업 전용 R2 키를 등록하고 `dev`의 예약 워크플로와 `main`의 백업 도구를 반영했다. 기존 배포 토큰의 D1 Read로 내보내기가 인증 오류(10000)로 거절되어, 승인받은 별도 `devlog-content-backup-export` 토큰을 `CONTENT_BACKUP_D1_TOKEN`에 연결했다. 계정 전체 D1 Write 범위이며 기존 배포 토큰은 변경하지 않았다. [Actions 실행 36387646550](https://github.com/whateveriiwant/devlog/actions/runs/36387646550)은 1분 33초 만에 성공했다. 주간 `weekly/2026-09-28T06-41-44-831Z.bin`과 월간 `monthly/2026-09.bin`을 API 목록에서 확인했다(각 142,123,871 bytes). 월간 원격 파일을 내려받아 복호화하고 별도 복원했다: 글 126건, 초안 1건, 시리즈 23개, 객체 278개, 이미지 참조 201개, 무결성 ok, 외래 키 오류 0, 운영 쓰기 0. 보고서는 로컬 `devlog-backups/restore-check/2026-09-28-actions/verified/restore-report.json`에 있다.
- 발급 화면 확인 중 새 D1 토큰이 도구 출력에 포함되어 동일 권한으로 교체 및 기존 토큰 폐기 승인을 받았다. 대체 토큰을 발급했고 GitHub 비밀값 저장 전 본인 확인을 기다리고 있다. 이 보안 정리 전에는 A1을 최종 완료 표시하지 않는다.
- 위 로컬 사본은 이 컴퓨터에 의존한다. 컴퓨터를 잃어도 복구하려면 암호화 키를 별도 안전한 개인 저장소에 추가로 보관해야 한다. GitHub secret은 원래 값 조회 기능을 제공하지 않으므로 유일한 키 사본으로 쓰지 않는다.

## 수동 백업

저장소 밖 소유자 전용 디렉터리를 사용한다. 아래 경로는 새로 만들 출력 경로로 바꾼다. `capture`/`restore`는 이미 있는 출력 디렉터리를 덮어쓰지 않는다.

```sh
umask 077
pnpm exec wrangler d1 export devlog-content --remote \
  --config wrangler.cms.jsonc --output /private/backup/content.sql
CLOUDFLARE_ACCOUNT_ID=<계정_ID> R2_BUCKET=devlog-assets \
  node scripts/backup-content.mjs capture /private/backup/content.sql /private/backup/snapshot
node scripts/backup-content.mjs restore /private/backup/snapshot /private/backup/restore-check
node scripts/export-d1-markdown.mjs /private/backup/snapshot/content.sql /private/backup/markdown-export
```

- 계정 ID는 비밀 토큰이 아니다. API 토큰·R2 키는 환경변수 또는 기존 Wrangler 로그인으로만 전달한다.
- 로컬 macOS에서는 기존 Wrangler OAuth 로그인을 사용할 수 있다. 자동화는 기존 원본 버킷 R2 S3 키를 사용한다.
- Wrangler D1 export에는 내보내는 동안 DB 조회가 일시적으로 불가능할 수 있다는 경고가 있다. 운영 호출이 적은 시간에 실행하고 오류를 확인한다.
- 참조 이미지가 없거나 목록·다운로드·무결성 검사에 실패하면 완성 manifest를 만들지 않는다. 실패 디렉터리를 성공 백업으로 사용하지 않는다.
- SQL과 R2는 서비스 간 원자적 스냅샷이 아니다. 백업 중 발행·이미지 삭제를 피한다. 크기·ETag 변경 또는 참조 누락을 감지하면 새 백업으로 재시도한다.

## 암호화 파일 복구

1. R2 백업을 새 개인 경로에 다운로드한다. 운영 원본 버킷을 덮어쓰지 않는다.
2. `CONTENT_BACKUP_KEY`를 안전한 키 보관소에서 환경변수로 전달한다. 명령·로그·대화에 실제 값을 쓰지 않는다.
3. 인증된 복호화 후 별도 빈 디렉터리에 압축을 풀고 `restore`를 실행한다.

```sh
pnpm exec wrangler r2 object get devlog-content-backups/<백업키> \
  --remote --file /private/restore/content.bin
node scripts/content-backup-archive.mjs decrypt /private/restore/content.bin /private/restore/content.tar.gz
mkdir /private/restore/snapshot
tar -xzf /private/restore/content.tar.gz -C /private/restore/snapshot
node scripts/backup-content.mjs restore /private/restore/snapshot /private/restore/verified
```

복원 결과의 `content.sqlite`, 객체 파일, manifest와 `restore-report.json`을 확인한다. 객체는 안전한 해시 파일명으로 저장하며 원래 R2 키·메타데이터는 manifest에 있다. 세션 이름이 포함된 테이블은 복원 시 비운다. 현재 백업에는 세션 테이블이 없다.

이 절차는 **별도 환경 복구**까지 수행한다. 운영 DB import와 원본 R2 객체 재업로드는 자동 실행하지 않는다. 실제 장애 때는 쓰기·이미지 정리를 중단하고 복구 시점을 선택한 뒤 별도 DB/버킷에서 검증한다. 원래 키·메타데이터 복원, Worker 바인딩 전환, 조회·로그인·발행 확인 후 운영을 재개한다. 원본 버킷의 정리 표식은 복구하지 않는다.

## 자동화 연결

워크플로: `.github/workflows/content-backup.yml`.

- 매주 월요일 03:47 KST에 실행한다. GitHub 스케줄은 정각 실행이나 누락 없는 실행을 보장하는 복구 SLA로 가정하지 않는다.
- 원본 버킷에는 기존 `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`를 사용한다. 백업 도구는 원본 버킷에 쓰거나 삭제하지 않는다.
- 백업용 R2 키는 **`devlog-content-backups`만** 객체 읽기·쓰기 범위를 갖게 만든다. 원본 버킷이나 다른 버킷 권한을 추가하지 않는다.
- 새 GitHub secrets: `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`, `CONTENT_BACKUP_KEY`, `CONTENT_BACKUP_D1_TOKEN`. D1 내보내기용 토큰은 배포 토큰과 분리한다.
- 변수 `CONTENT_BACKUPS_ENABLED=true`는 모든 설정과 수동 Actions 실행이 가능한 상태에서만 활성화한다. 기본은 비활성이다.
- 현재 저장소 기본 브랜치는 `dev`이고 배포 브랜치는 `main`이다. 예약 워크플로가 기본 브랜치에 있어야 하므로 워크플로를 `dev`에도 반영했다. 스크립트는 워크플로의 `checkout ref: main`에 맞춰 `main`에 반영한다. 기본 브랜치 변경을 이 작업에 포함하지 않는다.
- 자동 실행은 SQL 복원과 전체 객체 해시 검사를 통과한 경우에만 암호화·업로드한다. plaintext를 Actions artifact로 올리지 않고 임시 파일은 `always()` 단계에서 지운다.
- 실패 시 기존 성공 백업을 보존한다. Actions 로그에서 실패 단계를 확인하되 export 로그의 임시 다운로드 URL과 내용은 공개 출력하지 않는다.
- 자동화 완료 조건: 실제 Actions 성공, 비공개 버킷의 새 주간·월간 암호화 객체, 원격 사본 다운로드·복호화·별도 복원 확인.

## 근거

- [실행 투두](./production-stabilization-todo-2026-09-27.md)
- [장기 보관·비용 계획](./sustainable-operation-cost-plan-2026-09-27.md)
- [Cloudflare R2 객체 목록 API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/list/): 페이지네이션 cursor를 따라 전체 목록을 조회한다.

이번 작업에서 운영 글·초안·이미지를 수정하거나 삭제하지 않았다. 백업용 버킷과 암호화 파일만 새로 만들었다.
