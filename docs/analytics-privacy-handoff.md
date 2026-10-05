# 운영 개인정보 안내 후속 인계 프롬프트

아래 프롬프트는 개인정보 안내의 남은 확인만 이어가기 위한 것이다. 실제 분석 검증·설정 변경·출시·다음 체크리스트는 자동 시작하지 않는다.

```text
devlog GA4 후속 작업 중 ‘운영 개인정보 안내의 남은 외부 사실 확인과 최종 문안 준비’만 이어서 진행해.

먼저 적용 AGENTS.md, /Users/seungjun/Documents/devlog/docs/analytics-implementation-plan.md 13절의 마지막 후속 기록, /Users/seungjun/.codex/worktrees/ga4-completion/devlog/docs/analytics-privacy-operations-proposal.md와 이 인계를 읽어. 운영 문서의 2026-10-03 ‘출시 전 사실 확인과 수동 절차 보완’ 절에 직접 확인/사용자 제공/공개 표준/미확인 구분과 공식 근거가 있어. 이전 PDF 관련 기록은 앞 작업의 일부 쪽 읽기 기록이지 이번에 전체 법률/지침을 검증했다는 뜻이 아니야.

작업 트리 /Users/seungjun/.codex/worktrees/ga4-completion/devlog, 브랜치 codex/ga4-completion, PR https://github.com/whateveriiwant/devlog/pull/34. 마지막 직접 확인 HEAD e8a22d38c093514d34fb1b3489db1a0a1a562dc7, PR OPEN/draft 동일 head. 실제 상태를 다시 확인하고 기존 미커밋·미추적 변경을 보존해. 개인정보 작업은 commit/push하지 않아 원격 PR에 아직 반영하지 않았어. 기본 폴더의 다른 사용자 변경을 건드리지 마. 시작 스냅샷은 /tmp/devlog-privacy-facts-20261003에 있으며 유지 여부는 다시 확인해.

확정된 결정은 다시 묻지 마:
- basic 동의: 허용 전 태그 미로딩, 동의한 방문자만 수집.
- 운영자 정승준, 개인정보 문의·열람·삭제·처리정지 창구 me@seungjun.sh. 수신·확인 가능, iCloud Mail 수신, Spark에서 확인. 추가 사용자 답변은 “메일 전달규칙 따로 없어 / 스파크는 송수신만 하는 정도야”. 전달·규칙 없음과 Spark 송수신 정도 사용을 사용자 제공 사실로 반영했으며 다시 묻지 마. 설정/전체 기능 감사 결과는 아니야.
- 사용자 제공 사실: 과거 GA 별도 저장 없음; Apple 계정 국가 대한민국; 사이트 백업을 다른 곳에 저장하거나 공유한 적 없음. 전체 계정·기기·접근 권한 감사 결과로 확대하지 마.
- GA 이벤트 2개월/사용자 14개월/새 활동 때 재설정 켜짐, 동의 localStorage 자동 만료 없음 유지.
- 해외 방문 가능한 한국어 공개 블로그. 시행일은 실제 공개일, 아직 미기입이며 출시 승인이 아니야.
- 첫 답변은 접수 후 3영업일 목표이며 접수 확인/필요 정보 안내야. 법적 조치·통지 기한, Google에 요청 제출, 실제 삭제 완료와 구분해.
- 안전한 브라우저 식별/요청 범위를 확인한 뒤 가능한 조치·제한 사유·후속 일정/결과 안내. 새 분석 수집·재동의나 불필요한 신분증·토큰·전체 쿠키를 요구하지 마.
- 최소 요청 메일·기록은 종료 후 최대 90일 내 삭제, 첨부·불필요한 식별자 먼저 삭제. 휴지통도 포함. 월1회 다음 확인일까지 기한에 도달할 자료 미리 삭제. 대상만 영구 삭제할 조작이 미확인이면 iCloud 휴지통 최대30일을 감안해 종료 후60일을 넘기기 전에 대상 이동을 계획해. 모든 내부 백업의90일 삭제 보장은 아니야.
- GA CSV/BigQuery/자체 DB 저장 시작 안 함. 집계 보고서는 분석 운영 기간에 이용하고 분석 종료/폐쇄 시 속성 삭제 절차 진행. 실제 삭제는 별도 범위.

준비물: src/pages/privacy.astro는 /privacy/ 공개 경로 초안, noindex·분석 제외. 정책·Google 공유·iCloud/Spark·세션/백업의 보관 미확정·요청 제출/완료 구분을 반영했어. src/components/AnalyticsConsent.astro의 기존 하단/패널 링크·Google 공유 요약을 유지했고 동의/GA 로직은 이번에 변경하지 않았어. 전체 법률 준수나 출시 준비 완료로 기록하지 마.

읽기 확인한 범위:
- GA 운영 계정410455528, 속성557066996, 스트림15942609257, G-RQ6456HXLD. 4공유 모두 체크, 두 약관 수락일2026-10-02. 약관 관리 조직 없음/실제 법인명 미표시/연락처0행. 계정 국가 대한민국. 기본 쿠키 override 꺼짐. 관리자·보관 설정은 앞 작업의 기록/유지 결정. 향상된 측정 페이지/스크롤/외부 링크/검색/양식/동영상/다운로드 켜짐이며 맞춤 코드의 민감 값 제외를 자동 이벤트 전체 보장으로 확대하지 마.
- Cloudflare D1 devlog-content Time Travel 실제 화면 과거7일, 관할None/APAC/read replicationDisabled. 메일90일과 별개. R2 devlog-content-backups 4객체 약568.67MB/publicDisabled/APAC. initial/2026-09-27-content.bin 메타정보만 읽었어. 버킷 규칙은 미완료 multipart7일 중단만 있으며 완료 객체 만료는 확인되지 않았어.
- GitHub CONTENT_BACKUPS_ENABLED=true, active workflow와 실행36388167681 export/verify/encrypt/store/cleanup 성공. 해당 snapshot 표에 admin_sessions는 없었지만 객체 내용은 내려받지 않았어. 전체 SQL 백업 구현은 세션이 있으면 포함 가능해. 주간4/월간12 개수 정리, 성공 저장 뒤에만 정리, initial은 정리 패턴 밖. 고정4주/12개월 삭제 보장 아님. runner cleanup도 공급자 물리 소거 보장 아님.
- 코드의 관리자 세션은 D1에 해시/GitHub로그인/생성·만료시각, 유효12시간, 다음 로그인 만료행 삭제/로그아웃 해당행 삭제. 정기 물리 삭제 없음. 복원 때 세션을 비워도 원본 백업은 남아. 현재 원격main e55afb3d31821b0efb7ebf57b391cd3ef78fcb71 코드와 실제 배포 일치는 이번에 확인하지 않았어.
- 앞 작업 Workers Logs/TracesDisabled 기록과 이번 R2 Data Access LogsDisabled를 전체 접속/보안 정보 부재로 일반화하지 마. 전체 로그/접근자/계약·보관은 미확인.
- Google 표준 약관/DPA/controllerterms와 실제 계정 수락/적용 조건은 별개. 국외 수령자·국가·연락처·이전근거를 시설/지원 목록으로 채우지 마.
- Apple 공개 한국 지역 약관은 Apple Services Pte.Ltd.를 안내하나 실제 수락 버전/국외 처리 국가/내부 백업 기한은 미확인. Spark는 기능별 서버 처리/보관이 다르며 통상1주 DB백업도 특정 자료의 최대 삭제 보장 아님.
- 사용자 탐색은 웹DeviceID=clientID, Editor이상 대상삭제,24시간내 표시제외/다음63일내 영구삭제 설명. API v1alpha submitUserDeletion의 deletionRequestTime은 제출시각. 실제 방문자 조회/삭제/API호출하지 않았어. 기존 쿠키→안전한 ID 읽기/본인확인·완료확인 방법은 실행 전 과제야.
- 개인정보보호법/시행령2026-09-11 해당 권리 조항의10일조치·통지/예외 및28조의8 이전요건을 읽었지만 이 블로그 법률 적용 전체는 미확정. 추가정보나Google대기로 기한이 자동 재시작/연장되지 않아. GDPR기한은EDPB공식 조건부 설명을 읽었으나 영토적 적용 확인은 충분하지 않았어. 해외방문만으로 적용 확정하지 마.

남은 외부 확인:
1. 계정별 Google/Cloudflare/Apple/Spark 계약 버전·실제 수령자/국가/연락처·시점/방법·보관/이전 근거. 공개되지 않으면 공급자 문의 경로와 공개자료 한계를 명시하고 반복 조사로 무한 확대하지 마.
2. 세션·백업의 최종 삭제 기준, initial 사본 목적/삭제일, 실패시 오래된 사본 처리, 실배포 대응·접근자. 변경 필요는 기록만 해. 메일90일을 적용하지 마.
3. 사용자에게 이미 한 번 묶어 질문했지만 답변되지 않은 메일 기기/로컬 폴더/다운로드/내보내기/기기백업 여부만 사용자 사실로 남아. 전달·규칙 없음, Spark 송수신 정도 사용, 앱·국가·사이트외부백업 없음은 이미 답변됐으니 다시 묻지 마. 추가 기능을 사용 중이라고 단정하지 마. 공급자 자동 처리/내부 사본·앱별 삭제/동기화는 별도 미확인이야. 본문·암호는 필요 없어. 답변과 독립적인 작업은 계속 진행해.
4. 실제 요청 전 안전한 기존 브라우저ID 읽기/본인·대리인 확인, 대상만 조회·삭제·기한/제한 통지·완료확인, Spark 대상만 영구삭제/동기화 조작의 확인. 실제 방문자/메일 삭제는 실행하지 마.

필요한 최소 문안·링크·기존 동의 보호의 로컬 무수집 확인까지만 허용해. 계획은 두 폴더 기존 내용 뒤에 결과/근거/검증/미확인 사항을 추가해. 인계를 갱신하고 멈춰.

Google Network/DebugView/Realtime 양성 수신과 실제 쿠키 생성·갱신·철회 검증은 별도 남은 항목이야. 승인된 분리 검증 환경/색인 가능 경로/동의 상태/브라우저 프로필이 필요하며 이번에 시작하거나 보호조건을 해제하지 마. GA 공유/약관 수락/설정·활성화/인덱싱 변수 변경, 실제 데이터 삭제, commit/push, PRmerge, stage/production배포와 다음 체크리스트는 하지 마.
```
## GA 설정·격리 검증 다음 단계 인계 — 2026-10-05

위 개인정보 인계는 해당 범위를 다시 요청할 때 사용한다. GA 설정/격리 검증은 아래 프롬프트에서 **사용자가 선택·지시한 단계만** 수행한다. 선택란이 비어 있으면 문서 검토와 읽기 확인까지만 허용된다.

```text
devlog GA4 후속 작업 중 아래에 내가 명시한 범위만 이어서 진행해.
실행할 단계: [운영 GA 조정 / 테스트 속성 설정·정의 / validation 코드 구현 / 격리 환경 생성·배포 / 실제 Google 수신·쿠키 검증 중 명시]
격리 방식: [A 별도 인증된 HTTPS origin / B stage 합성 제한 경로 / C 모의만]
검증 origin·접근 방식: [실행 필요 시 지정 또는 선택 요청]
자동 외부 링크 측정: [끔 / 안전성 검증과 안내 반영을 전제로 유지]

먼저 적용 AGENTS.md와 두 폴더 docs/analytics-implementation-plan.md 13절 마지막 ‘운영 GA 설정 최종 조정안과 격리 검증 준비 — 2026-10-05’를 읽어. 개인정보 운영 문서와 기존 인계의 확정 결정·출시 조건도 유지해.
기본 폴더 /Users/seungjun/Documents/devlog에는 다른 사용자 변경이 있으니 건드리지 마. 구현 트리는 /Users/seungjun/.codex/worktrees/ga4-completion/devlog, 브랜치 codex/ga4-completion, PR https://github.com/whateveriiwant/devlog/pull/34.
2026-10-05 직접 확인 HEAD는 e8a22d38c093514d34fb1b3489db1a0a1a562dc7, PR은 OPEN/draft·동일 head, 기존 build CI는 성공이야. 미커밋 개인정보·준비 문서의 CI 검증은 아니야. 시작 스냅샷은 /tmp/devlog-ga4-preparation-20261005. 실제 상태를 다시 확인하고 기존 변경을 보존해. 계획 원문 뒤에 결과를 추가해.

2026-10-05 운영 관리 화면 직접 확인:
- 계정 410455528 / 속성 557066996 / 스트림 15942609257 / G-RQ6456HXLD / https://seungjun.sh.
- 향상된 측정 7개와 브라우저 기록 기반 조회 켜짐. 이메일 수정 활성 / URL 쿼리 키 수정 비활성.
- 맞춤 측정기준 0개, 운영자 관리자. 등록안은 Event 범위의 progress_percent(25/50/75/90), navigation_direction(previous/next), target_path(같은 사이트의 글 pathname). 저장하지 않았어.
- Internal Traffic 제외 / Testing / traffic_type=internal. IP 내부 트래픽 정의 0개, 개발자 필터 없음. 필터가 있어도 운영자 방문이 이미 제외된다고 설명하지 마.
- 보관 2/14개월 / 새 활동 재설정 켜짐. Signals·사용자 제공 데이터 미활성, 세부 위치/기기 켜짐, 광고 개인 최적화 허용 307/307. 계정 공유 4개 체크 / 두 약관 수락일 2026-10-02. 모두 변경하지 않았어. 쿠키 override 꺼짐은 2026-10-03 기록이며 이번 재확인 아님.
- 테스트 ID G-8SFTFGKZ9Y의 현재 속성·정의·필터·권한·향상된 측정은 미확인. 실행 전에 따로 읽어. 운영 값을 그대로 적용하지 마.

조정안은 채택/적용 상태가 아니야:
- config 1회 기본 page_view 유지, 수동 page_view 추가 없음. 브라우저 기록 기반 조회와 기본 scroll 끔 제안.
- 검색은 API 모달이라 자동 URL 검색과 맞지 않아 끔 제안. 양식/동영상/다운로드는 읽은 기능에서 필요성을 확인하지 못해 끔 제안이며 운영 D1 전체 기능 부재를 확정한 것은 아니야.
- 외부 링크는 사용자 선택, 실제 URL/payload 안전성, 개인정보 안내 일치에 따른 조건부 유지 후보야.
- 공통 번들이 있어도 현재 수집은 공개 글만이야. 다른 전역 태그/config/수동 조회/history 변경이 더해지면 중복 가능해. BFCache의 같은 문서 복원과 새 문서를 구분해.

현재 noindex 보호와 양성 수신은 코드상 충돌해. 승인된 validation target, 정확한 HTTPS origin, 테스트 ID, 서버 인증, 합성 path만 허용하는 좁은 조건이 필요해. noindex meta/header는 계속 유지하고 일반 stage/prod의 noindex 차단은 그대로 둬. 인증·robots를 임의 우회하거나 DOM에서 noindex를 지워 검증하지 마. 기존 stage 전체 noindex 해제와 운영 ID를 stage/검증 origin에 넣는 것은 금지야.
A는 별도 인증 origin과 합성 fixture, B는 stage 합성 제한 경로야. 운영 D1/R2/초안/글/이미지에 연결·복제·수정·삭제하지 마. 인증 토큰을 URL에 넣지 마. sitemap/RSS/목록/검색에서 검증 자료를 제외해. 인증/robots Disallow 때문에 crawler가 noindex를 읽지 못하는 한계도 기록하고 절대 미노출을 보장하지 마.
필요 변경 후보는 BaseLayout, analytics.ts, Worker article 분기, 전용 설정, 기존 두 분석 검증 스크립트, 합성 fixture이며 아직 구현하지 않았어. 코드만 승인된 단계면 Google stub과 무수집 검사까지만 해. 환경 생성·배포·Google 양성 수신은 각각 명시 범위가 있어야 해.

실제 검증이 명시 허용되면 계획의 체크리스트/증거 양식을 사용해:
- 동의 전·거부 시 태그/요청 0, 허용 뒤 page_view 1회, progress 4구간, navigation 두 방향을 Network와 DebugView에서 확인해.
- 긴/짧은/이미지 글, 키보드/새 탭/뒤로 가기/BFCache, 중복 리스너, 태그 차단, 철회/다른 탭/저장 실패, 쿠키 scope/expiry/철회, query/hash/합성 민감 값/자동 이벤트, 제외 경로를 각각 확인해.
- 현재 stage는 #ga_debug를 각 새 문서에 요구하지만 이전/다음 링크에는 없어. validation 조건이 목적지에도 이어지는지 확인해. Tag Assistant가 query를 추가하면 게이트와 충돌할 수 있어.
- Network 응답 성공, 테스트 DebugView 실제 수신, 지연 보고 반영은 별도 완료 조건이야. Active 제외 데이터로 보고서 반영을 기대하지 마. 맞춤 정의의 통상 24–48시간과 필터 지연을 고려하고 실제 확인까지 대기 상태로 남겨.
- 과거 테스트 수신/모의 PASS를 현재 구현 수신 증거로 재사용하지 마. raw HAR, 쿠키 값/client ID, 개인 IP, 인증 정보를 Git에 남기지 마.

확정 결정과 사용자 제공 사실은 기존 인계대로 유지하고 다시 묻지 마. basic 동의, 운영자·문의 창구, 보관, 동의 저장, 첫 답변 목표, 메일 삭제, 별도 GA 저장 안 함, 실제 공개일 시행을 변경하지 마. 사용자 답변을 계정·기기 전체 감사로 확대하지 마.
계정별 공급자 계약·국외 처리·세션/백업 최종 삭제·안전한 권리 행사 실행은 별도 출시 조건으로 유지하고 같은 조사를 무한 반복하지 마.

이번에 지시하지 않은 GA 설정/공유/약관/맞춤 정의/필터 변경, Google 양성·쿠키 태그 실행, 방문자/메일 조회·삭제, 활성화·인덱싱 변수 변경, commit/push/PR merge/stage·production 배포는 금지야. 실제 운영 활성화·출시·배포 후 Network/Realtime·운영 지연 보고는 별도 다음 단계야. 결과·공식 근거·증거·미확인을 두 계획 뒤에 추가하고 인계 갱신 후 멈춰. 다음 체크리스트를 자동 시작하지 마.
```


## 최소 완료 경로 실행 후 인계 — 2026-10-05

이전 프롬프트의 ‘미실행/미커밋’은 당시 상태다. 최신 결과는 계획 13절의 ‘최소 완료 경로 실행’ 이후 기록을 우선한다. 아래 프롬프트는 남은 단계 재개용이며 다음 체크리스트를 자동 시작하지 않는다.

```text
devlog GA4의 원래 목표는 운영 GA에서 글별 조회수·본문 도달·이전/다음 지표를 확인하는 것이야. 최소 완료 경로를 실행한 뒤 남은 단계만 이어서 진행해. 확정한 정책·사용자 제공 사실을 다시 묻지 마.

먼저 적용 AGENTS.md, 구현 트리 docs/analytics-implementation-plan.md 13절 ‘최소 완료 경로 실행 — 2026-10-05’ 이후 기록, docs/analytics-privacy-operations-proposal.md 마지막 절과 기존 개인정보 출시 조건을 읽어.

트리는 /Users/seungjun/.codex/worktrees/ga4-completion/devlog, 브랜치 codex/ga4-completion, PR https://github.com/whateveriiwant/devlog/pull/34야. 시작 HEAD는 e8a22d38c093514d34fb1b3489db1a0a1a562dc7였어. 작업 커밋과 최신 원격 head/CI는 종료 요약 및 gh pr view 34로 실제 재확인해. 예전 CI 성공을 최신 변경의 증거로 쓰지 마. 두 시작 스냅샷 /tmp/devlog-ga4-minimal-20261005-start 및 /tmp/devlog-ga4-preparation-20261005를 보존해. 기본 /Users/seungjun/Documents/devlog에는 다른 사용자 변경이 있어 쓰지 마. 기본 폴더용 계획 추가분은 /tmp 별도 파일로 준비했어.

이미 완료한 GA 조정:
- 운영은 계정 410455528 / 속성 557066996 / 스트림 15942609257 / G-RQ6456HXLD / seungjun.sh야.
- 테스트는 별도 계정 410497967 / 속성 557072864 / 스트림 15941128089 / G-8SFTFGKZ9Y / devlog-test야. 테스트 스트림 URL은 기존 stage이며 변경하지 않았어.
- 각각 직접 읽은 뒤 페이지 로드 조회만 유지하고 history 조회 및 나머지 6개 자동 측정을 OFF로 저장·재열어 확인했어. 외부 링크도 OFF야. Event 범위 progress_percent, navigation_direction, target_path 3개를 각각 등록했어.
- 공유·약관·보관·Signals·광고·필터는 바꾸지 않았어. Internal Traffic은 제외/Testing이므로 방문이 이미 제외됐다고 설명하지 마. 운영 IP 규칙 0개는 앞 직접 확인이고 테스트 IP 규칙은 미확인이야. 운영 쿠키 override OFF는 2026-10-03 기록이야.

가입 없이 만든 격리 방식 A:
- origin은 https://devlog-ga-validation.seungjun-jeong10.workers.dev야. 기존 Workers의 HTTPS Basic 인증과 secret을 사용했어. validation target, 테스트 ID, 정확한 origin, 서버 인증 표식, 정확한 합성 5경로, query/hash 없음, noindex/nofollow가 모두 맞아야 수집해. 일반 stage/prod의 noindex 차단은 유지했어.
- 자격 증명은 Git 밖 /tmp/devlog-ga4-validation-credentials-20261005.json, mode 0600, user/password 필드야. 값이나 Authorization을 출력·Git 저장·URL 삽입하지 마. 인증은 정확한 origin에만 공급해. 전용 Worker 버전은 계획 종료 기록 및 deployments list로 재확인해.
- ASSETS만 바인딩하며 합성 본문·SVG·최소 참조 자산만 업로드했어. 운영 D1/R2/CMS/글/이미지에 연결·복제·수정·삭제하지 마. sitemap/RSS/목록/검색에서 합성 자료를 제외해. 인증/noindex/Disallow를 제거하거나 DOM에서 우회하지 마. crawler가 noindex를 읽지 못하는 한계 때문에 절대 미노출을 보장하지 마.

검증과 구현:
- 사용자가 ‘별도 Playwright 브라우저로 검증’을 승인했어. 기존 Chrome 데이터를 쓰지 않고 설치된 Chrome의 새 프로필을 사용했어. headless Network 검사 후 별도 일반 창에서 실제 테스트 DebugView 수신을 확인했어.
- 허용 전·거부 시 태그/Google 요청 0, 허용 후 새 문서 page_view 1회, 긴/짧은/이미지의 progress 4구간, 키보드 previous/일반 next와 새 탭/가운데 클릭의 HTTP 204, 철회 쿠키 0/다른 탭 중단, 저장 실패/태그 차단, query/hash 합성 민감 값과 제외 경로 검사가 통과했어.
- 테스트 DebugView에서 이번 page_view, progress 25/50/75/90, previous/next 및 안전한 page_location/target_path를 열어 읽었어. 전체 글별 DebugView 매개변수 대조와 지연 보고는 별도 확인이야. 실제 BFCache는 두 실행 모드 모두 persisted=false로 관찰하지 못했어. 모의 동일 문서 중복 방지 PASS를 실제 복원 증거로 쓰지 마.
- Google Domain 쿠키가 철회 뒤 남던 문제를 host-only/Domain 두 범위 만료로 수정했어. cookie_flags는 Secure/SameSite=Lax야. 검증 쿠키의 Domain은 현재 검증 호스트, Path는 루트, 실행 당시 만료는 약 400일이었어. 운영 쿠키 결과는 별도 확인해야 해.
- 같은 탭 클릭은 sessionStorage에 출발 주소·목적지 pathname·방향·시각 한 건만 임시 보관하고 다음 동의한 허용 문서가 10초 안에 읽으면 삭제한 뒤 출발 글 클릭으로 전송해. 새 탭은 출발 문서에서 보내며 이동을 지연시키지 않아. 10초는 사용 조건이지 물리 삭제 타이머가 아니야. 읽지 못하면 탭 종료까지 남을 수 있고 거부·철회 때 폐기해. 저장 실패·목적지 미수집·10초 초과·차단 시 누락될 수 있어. 클릭 전체나 로드 성공률을 보장하는 지표로 설명하지 마.
- 임시 이동 값에 query/hash·식별자·인증 정보를 넣지 않아. localStorage 동의 자동 만료 없음과 GA 별도 내보내기 금지는 그대로야. 공개 초안과 합성 안내에 탭 임시 저장을 반영했어.
- 전용 Worker/fixture/prepare 코드와 기존 두 분석 검증 스크립트가 변경됐어. 최종 기본 dist는 disabled야. check/production 모의/disabled/runtime 로그는 /tmp/devlog-ga4-final-*-20261005.log, 값 제외 Network 증거는 /tmp/devlog-ga4-live-{evidence,followup-evidence,headed-core-evidence}-20261005.json이야. raw HAR/client ID/쿠키 값/개인 IP/인증 정보는 Git에 남기지 마.

남은 완료 조건:
1. 실제 BFCache 복원과 전체 글별 DebugView 매개변수 대조, 맞춤 정의 등록 후 통상 24–48시간을 고려한 테스트 지연 보고 실제 값 확인. Active 제외 데이터로 보고 값을 기대하지 마. 자동 후속 일정은 요청 없이 만들지 마.
2. 기존 계정별 공급자 계약·국외 수령자/국가/연락처/근거, 세션·백업 최종 삭제 기준, 안전한 권리 행사 실행 가능성, 미답변 메일 기기·로컬·다운로드·내보내기·기기 백업 사실. 같은 공개 조사를 무한 반복하거나 전체 계정·기기 감사로 확대하지 마. 실제 방문자/메일 조회·삭제·공급자 문의 발송은 이번 범위가 아니야.
3. 출시 조건 충족 뒤 최종 안내의 실제 공개일, 최신 PR/CI, merge·활성화·운영 배포. 현재 GA4_PRODUCTION_ENABLED와 ALLOW_INDEXING은 없어 운영 수집이 꺼져 있어. CLOUDFLARE_DEPLOY_ENABLED=true라 main merge는 CMS/site 배포를 일으키므로 초안을 그대로 출시하지 마.
4. 운영 배포 뒤 Network/Realtime 및 글 경로별 조회/맞춤 지표의 지연 보고를 실제 확인해야 원래 목표가 완료야. 테스트 수신을 운영 완료 증거로 재사용하지 마.

확정한 basic 동의, 정승준/me@seungjun.sh, 보관 2/14개월, 3영업일 첫 답변, 종료 후 90일 내 대상 요청 메일 삭제(휴지통 포함), iCloud/Spark 송수신, 전달 규칙 없음, Apple 계정 대한민국, 사이트 백업 외부 저장·공유 없음, GA 별도 CSV/BigQuery/DB 저장 안 함을 유지해. 실제 공개일 시행과 공급자 내부 사본의 한계도 그대로야. 개인정보 초안·미확인 출시 조건을 완료 처리하지 마.

남은 출시 조건을 해결하기 전에는 공유·약관·필터 임의 변경, 운영 수집·인덱싱 변수 변경, PR merge/stage·production 배포, 실제 방문자·메일 조회/삭제를 하지 마. 결과·공식 근거·미확인을 계획 원문 뒤에 추가하고 인계를 갱신한 뒤 멈춰. 다음 체크리스트는 자동 시작하지 마.
```
